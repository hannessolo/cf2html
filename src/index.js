/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

async function fetchReference(reference, env) {
	const fixedReference = reference.startsWith('/content/dam') ? reference.split('/content/dam')[1] : reference;

	const fetchUrl = `https://author-p130360-e1463269.adobeaemcloud.com/api/assets${fixedReference}.json`;
	console.log(`requesting ${fetchUrl}`)

	const response = await fetch(fetchUrl, {
		headers: {
			// https://experienceleague.adobe.com/en/docs/experience-manager-learn/getting-started-with-aem-headless/authentication/local-development-access-token
			authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
		}
	});

	if (!response.ok) {
		throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText }));
	}

	return await response.json();
}

async function visitTitle(node) {
	return `<h1>${node.properties.elements.title.value}</h1>`;
}

async function visitParagraph(node) {
	return node.properties.elements.paragraph.value;
}

async function visitBlockRow(node) {
  let result = '<div>';
	node.properties.elements.columns.value.forEach((column) => {
		result += `<div>${column}</div>`;
	});
	result += '<div>';
	return result;
}

async function visitBlock(node, env) {
	let r = `<div class="${node.properties.elements.blockName.value}">`;
	const childResults = await Promise.all(node.properties.elements.rows.value.map(async (child) => {
		const dereferencedFragment = await fetchReference(child, env);
		return visit(dereferencedFragment, env);
	}));
	childResults.forEach((result) => {
		r += result;
	});
	r += '</div>'
	return r;
}

async function visitSection(node, env) {
	let r = '<div>';
	const childResults = await Promise.all(node.properties.elements.children.value.map(async (child) => {
		const dereferencedFragment = await fetchReference(child, env);
		return visit(dereferencedFragment, env);
	}));
	childResults.forEach((result) => {
		r += result;
	});
	r += '</div>';
	return r;
}

async function visitPage(node, env) {
	let r = '<body><header></header><main>';
	const sectionsResults = await Promise.all(node.properties.elements.sections.value.map(async (section) => {
		const dereferencedFragment = await fetchReference(section, env);
		return visit(dereferencedFragment, env);
	}));
	sectionsResults.forEach((section) => {
		r += section;
	});
	r += '</main><footer></footer></body>'
	return r;
}

async function visit(node, env) {
	switch (node.properties?.['cq:model']?.path) {
		case '/conf/global/settings/dam/cfm/models/page':
			return visitPage(node, env);
		case '/conf/global/settings/dam/cfm/models/section':
			return visitSection(node, env);
		case '/conf/global/settings/dam/cfm/models/title':
			return visitTitle(node, env);
		case '/conf/global/settings/dam/cfm/models/paragraph':
			return visitParagraph(node, env);
		case '/conf/global/settings/dam/cfm/models/block':
			return visitBlock(node, env);
		case '/conf/global/settings/dam/cfm/models/block-row':
			return visitBlockRow(node, env);
		default:
			throw new Error(`not implemented: ${node}`);
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const pathName = url.pathname.endsWith('/') ? `${url.pathname}index` : url.pathname;

		try {
			const data = await fetchReference(pathName, env);

			if (data.properties?.['cq:model']?.path !== '/conf/global/settings/dam/cfm/models/page') {
				return new Response(null, { status: 404 });
			}

			const result = await visit(data, env);
			return new Response(result, {
				headers: { 'Content-Type': 'text/html' },
			});
		} catch (e) {
			return new Response(null, { status: 404 });
		}
	},
};

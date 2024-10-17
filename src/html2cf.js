async function createContentFragment(env, path, content) {
	const url = `https://${env.AUTHOR_INSTANCE}.adobeaemcloud.com${path}`;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
				'X-Aem-Affinity-Type': 'api'
			},
			body: JSON.stringify(content)
		});

		if (!response.ok) {
			throw new Error(response.statusText);
		}

		const jsonResponse = await response.json();

		return jsonResponse['path'];
	} catch (error) {
		console.error(`Error creating content fragment: ${error}`);
	}
}

async function createBlockRow(node, env) {
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-block-row-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/block-row'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'columns', type: 'long-text', mimeType: 'text/html', multiple: node.columns.length > 0, values: node.columns.map((c) => c.text)},
		]
	});

}

async function createSection(node, env) {
	// Implementation for creating a section
	const returnedFragments = await Promise.all(node.children.map((c) => visit(c, env)));
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-section-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/section'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'children', type: 'content-fragment', multiple: returnedFragments.length > 0, values: returnedFragments},
		]
	});
}

async function createBlock(node, env) {
	// Implementation for creating a block
	const returnedFragments = await Promise.all(node.rows.map((c) => visit(c, env)));
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-block-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/block'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'blockName', type: 'text', multiple: false, values: [node.name] },
			{ name: 'rows', type: 'content-fragment', multiple: returnedFragments.length > 0, values: returnedFragments},
		]
	});
}

async function createTitle(node, env) {
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-title-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/title'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'title', type: 'text', values: [node.text]},
			{ name: 'titleLevel', type: 'enumeration', values: [node.titleType]},
		]
	});
}

async function createParagraph(node, env) {
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-paragraph-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/paragraph'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'paragraph', type: 'long-text', mimeType: 'text/html', values: [node.text]},
		]
	});
}

async function createPage(node, env) {
	const returnedFragments = await Promise.all(node.sections.map((c) => visit(c, env)));
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-page-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/page'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'sections', type: 'content-fragment', multiple: returnedFragments.length > 0, values: returnedFragments},
		]
	});
}

export function visit(node, env) {
	switch (node.type) {
		case 'page':
			return createPage(node, env);
		case 'section':
			return createSection(node, env);
		case 'block':
			return createBlock(node, env);
		case 'block-row':
			return createBlockRow(node, env);
		case 'title':
			return createTitle(node, env);
		case 'paragraph':
			return createParagraph(node, env);
		default:
			throw new Error(`not implemented: ${node.type}`);

	}
}

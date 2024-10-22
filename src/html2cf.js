const querySinglePage = `
query Page($path: String!) {
  pageByPath(_path: $path) {
    item {
      _id
      _path
    }
  }
}
`;

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

async function updateContentFragment(env, content, fragmentPath) {
	const getCFUrl = `https://${env.AUTHOR_INSTANCE}.adobeaemcloud.com/content/_cq_graphql/global/endpoint.json`;

	const fragmentResponse = await fetch(getCFUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
		},
		body: JSON.stringify({ query: querySinglePage, variables: { path: fragmentPath } }),
	});

	if (!fragmentResponse.ok) {
		throw new Error(fragmentResponse.status);
	}

	const fragment = await fragmentResponse.json();
	const fragmentId = fragment.data.pageByPath.item._id;

	console.log(fragmentId)


	const url = `https://${env.AUTHOR_INSTANCE}.adobeaemcloud.com/adobe/sites/cf/fragments/${fragmentId}`;
	const etagResponse = await fetch(url, {
		headers: {
			authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
			'X-Aem-Affinity-Type': 'api',
		}
	});
	const etag = etagResponse.headers.get('etag');
	console.log(etagResponse.headers);

	try {
		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
				'X-Aem-Affinity-Type': 'api',
				'If-Match': etag,
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
	return await updateContentFragment(env, {
		title: `${env.prefix}-page-${Math.random() * 10}`,
		fields: [
			{ name: 'sections', type: 'content-fragment', multiple: returnedFragments.length > 0, values: returnedFragments},
		]
	}, env.pagePath);
}

export function visit(node, env) {
	console.log(node);
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

export async function createHTMLObject(response) {
	const output = {
		type: 'page',
		sections: [],
	};

	await new HTMLRewriter()
		.on('main > div', {
			element(e) {
				output.sections.push({ type: 'section', children: []});
			}
		})
		.on('main > div > h1, main > div > h2', {
			element(e) {
				output.sections.at(-1).children.push({ type: 'title', titleType: e.tagName, text: '' });
			}, text(t) {
				if (t.text.trim()) {
					output.sections.at(-1).children.at(-1).text = t.text;
				}
			}
		})
		.on(' main > div > p', {
			element(e) {
				output.sections.at(-1).children.push({ type: 'paragraph', titleType: e.tagName, text: '' });
			}, text(t) {
				if (t.text.trim()) {
					output.sections.at(-1).children.at(-1).text = `<p>${t.text}</p>`;
				}
			}
		})
		.on('main > div > div[class]', {
			element(e) {
				output.sections.at(-1).children.push({ type: 'block', rows: [], name: e.getAttribute('class') });
			}
		})
		.on('main > div > div[class] > div', {
			element(e) {
				output.sections.at(-1).children.at(-1).rows.push({ type: 'block-row', columns: [] });
			}
		})
		.on('main > div > div[class] > div > div', {
			element(e) {
				output.sections.at(-1).children.at(-1).rows.at(-1).columns.push({ type: 'block-column', text: '' });
			},
			text(t) {
				if (t.text.trim()) {
					output.sections.at(-1).children.at(-1).rows.at(-1).columns.at(-1).text = t.text.trim();

				}
			}
		})
		.transform(response)
		.arrayBuffer();
	return output;
}

import { visitPage } from './cf2html';
import { transformer } from './html2cf';

const query = `
query Page($path: String!) {
  pageByPath(_path: $path) {
    item {
      _path
      sections {
        children {
          __typename
          ... on TitleModel {
            title
            titleLevel
          }
          ... on ImageModel {
            image {
              __typename
              ... on ImageRef {
                _path
              }
              ... on DocumentRef {
                _path
              }
            }
          }
          ... on ParagraphModel {
            paragraph {
              html
            }
          }
          ... on BlockModel {
            blockName
            rows {
              ... on BlockRowModel {
                columns {
                  html
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

async function getGraphql(query, variables, env) {
	const fetchUrl = `https://${env.AUTHOR_INSTANCE}.adobeaemcloud.com/content/_cq_graphql/global/endpoint.json`;
	const response = await fetch(fetchUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!response.ok) {
		throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText }));
	}

	return await response.json();
}

async function serveImage(pathName, env) {
	const fetchUrl = `https://${env.AUTHOR_INSTANCE}.adobeaemcloud.com${pathName}`;
	const response = await fetch(fetchUrl, {
		headers: {
			authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
		},
	});

	if (!response.ok) {
		throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText }));
	}

	const imageBuffer = await response.arrayBuffer();
	return new Response(imageBuffer, {
		headers: { 'Content-Type': response.headers.get('Content-Type') },
	});
}

async function serveGql(pathName, env) {
	const result = await getGraphql(query, { path: `/content/dam${pathName}` }, env);
	return new Response(JSON.stringify(result), {
		headers: {
			'Content-Type': 'application/json',
		},
		status: 200,
	});
}

const IMAGE_FORMATS = [
	'.webp',
	'.png',
	'.jpg',
	'.jpeg',
]

async function handleGet(request, env, ctx) {
	const url = new URL(request.url);
	const authorName = url.pathname.match(/^\/author-p[0-9]+-e[0-9]+/)?.[0];

	env.AUTHOR_INSTANCE = authorName;

	if (!authorName) {
		return new Response('No author instance provided.', {
			status: 404,
		});
	}

	const resourcePath = url.pathname.split(authorName)[1];
	const pathName = resourcePath.endsWith('/') ? `${resourcePath}index` : resourcePath;

	const contentSourceAuthHeader = request.headers.get('authorization');

	env.AEM_DEV_TOKEN = contentSourceAuthHeader || env.AEM_DEV_TOKEN;

	if (IMAGE_FORMATS.reduce((acc, format) => acc || pathName.endsWith(format), false)) {
		return serveImage(pathName, env);
	}

	if (pathName.endsWith('.json')) {
		const gqlPathName = pathName.slice(0, -5);
		return serveGql(gqlPathName, env);
	}

	const result = await getGraphql(query, { path: `/content/dam${pathName}` }, env);

	const html = visitPage(result.data.pageByPath.item, env);

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text-html',
		}
	});
}

async function createContentFragment(env, path, content) {
	const url = `https://${env.AUTHOR_INSTANCE}.adobeaemcloud.com${path}`;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${env.AEM_DEV_TOKEN}`,
			},
			body: JSON.stringify(content)
		});

		if (!response.ok) {
			console.log(url)
			console.log(response.statusText);
			console.log(JSON.stringify(content));
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
	console.log(returnedFragments);
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
	console.log(returnedFragments);
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-block-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/block'),
		parentPath: '/projects/da-experiment',
		fields: [
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
	console.log(returnedFragments);
	return await createContentFragment(env, '/adobe/sites/cf/fragments', {
		title: `${env.prefix}-page-${Math.random() * 10}`,
		modelId: btoa('/conf/global/settings/dam/cfm/models/page'),
		parentPath: '/projects/da-experiment',
		fields: [
			{ name: 'sections', type: 'content-fragment', multiple: returnedFragments.length > 0, values: returnedFragments},
		]
	});
}

function visit(node, env) {
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

async function handlePost(request, env, ctx) {
	const url = new URL(request.url);
	const authorName = url.pathname.match(/^\/author-p[0-9]+-e[0-9]+/)?.[0];

	env.AUTHOR_INSTANCE = authorName;
	env.prefix = Date.now();

	if (!authorName) {
		return new Response('No author instance provided.', {
			status: 404,
		});
	}

	const response = new Response(request.body);

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

	const result = await visit(output, env);

	output.url = result;

	return new Response(JSON.stringify(output), { status: 200, headers: { 'content-type': 'application/json' } });
}

export default {
  async fetch(request, env, ctx) {
		if (request.method === 'GET') {
			return handleGet(request, env, ctx);
		} else if (request.method === 'POST') {
			return handlePost(request, env, ctx);
		}
		return new Response(null, { status: 405 });
  },
};

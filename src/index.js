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

function fixSrcLinks(string, env) {
	const fixed = string.replaceAll(/src="\/content\/dam/g, `src="${env.AUTHOR_INSTANCE}/content/dam`);
	return fixed;
}

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

function visitTitle(node) {
  return `<${node.titleLevel || 'h1'}>${node.title}</${node.titleLevel || 'h1'}>`;
}

function visitParagraph(node, env) {
  return fixSrcLinks(node.paragraph.html, env);
}

function visitImage(node, env) {
	return `<img src="${env.AUTHOR_INSTANCE}${node.image._path}">`
}

function visitBlockRow(node, env) {
  let result = '<div>';
  node.columns.forEach((column) => {
    result += `<div>${fixSrcLinks(column.html, env)}</div>`;
  });
  result += '</div>';
  return result;
}

function visitBlock(node, env) {
  let r = `<div class="${node.blockName}">`;
  node.rows.forEach((row) => {
		r += visitBlockRow(row, env);
	})
  r += '</div>'
  return r;
}

function visitSection(node, env) {
  let r = '<div>';
  node.children.forEach((child) => {
		r += visit(child, env);
	})
  r += '</div>';
  return r;
}

function visitPage(node, env) {
  let r = '<body><header></header><main>';
	node.sections.forEach((section) => {
		r+= visitSection(section, env);
	})
  r += '</main><footer></footer></body>'
  return r;
}

function visit(node, env) {
  switch (node.__typename) {
		case 'ParagraphModel':
			return visitParagraph(node, env);
		case 'BlockModel':
			return visitBlock(node, env);
		case 'TitleModel':
			return visitTitle(node);
		case 'ImageModel':
			return visitImage(node, env);
    default:
      throw new Error(`not implemented: ${node}`);
  }
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

export default {
  async fetch(request, env, ctx) {
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
  },
};

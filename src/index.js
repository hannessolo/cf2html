import { visitPage } from './cf2html';
import { createHTMLObject, visit } from './html2cf';

const query = `
query Page($path: String!) {
  pageByPath(_path: $path) {
    item {
      _id
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

	env.pagePath = `/content/dam/${url.pathname.split(authorName)[1]}`;

	const response = new Response(request.body);

	const output = await createHTMLObject(response);

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

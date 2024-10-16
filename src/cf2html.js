function fixSrcLinks(string, env) {
	const fixed = string.replaceAll(/src="\/content\/dam/g, `src="${env.AUTHOR_INSTANCE}/content/dam`);
	return fixed;
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

export function visitPage(node, env) {
	let r = '<body><header></header><main>';
	node.sections.forEach((section) => {
		r+= visitSection(section, env);
	})
	r += '</main><footer></footer></body>'
	return r;
}

export function visit(node, env) {
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

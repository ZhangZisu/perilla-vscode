import * as katex from 'katex'
import * as zmark from 'zmark'
import * as highlightjs from 'highlight.js'
import * as vscode from 'vscode'
import { join } from 'path'

export default function createProblemViewRenderer(baseURL, entry, token) {
  function resolveUrl(base, href) {
    if (href.slice(0, 2) === '//') {
      return base.replace(/:[\s\S]*/, ':') + href
    } else if (href.charAt(0) === '/') {
      return base.replace(/(:\/*[^/]*)[\s\S]*/, '$1') + href
    } else {
      return base + href
    }
  }

  function escape(html, encode) {
    if (encode) {
      if (escape.escapeTest.test(html)) {
        return html.replace(escape.escapeReplace, function (ch) { return escape.replacements[ch] })
      }
    } else {
      if (escape.escapeTestNoEncode.test(html)) {
        return html.replace(escape.escapeReplaceNoEncode, function (ch) { return escape.replacements[ch] })
      }
    }

    return html
  }

  escape.escapeTest = /[&<>"']/
  escape.escapeReplace = /[&<>"']/g
  escape.replacements = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }

  escape.escapeTestNoEncode = /[<>"']|&(?!#?\w+;)/
  escape.escapeReplaceNoEncode = /[<>"']|&(?!#?\w+;)/g

  const renderer = new zmark.Renderer()

  renderer.link = function (href, title, text) {
    if (this.options.sanitize) {
      try {
        var prot = decodeURIComponent(unescape(href))
          .replace(/[^\w:]/g, '')
          .toLowerCase()
      } catch (e) {
        return text
      }
      if (prot.indexOf('javascript:') === 0 || prot.indexOf('vbscript:') === 0 || prot.indexOf('data:') === 0) {
        return text
      }
    }
    if (href.startsWith('$')) {
      let id = href.substr(1)
      href = resolveUrl(baseURL, `/api/file/raw?id=${id}&entry=${entry}&access_token=${token}`)
    }
    try {
      href = encodeURI(href).replace(/%25/g, '%')
    } catch (e) {
      return text
    }
    var out = `<a href="${escape(href)}"`
    if (title) out += ` title="${title}"`
    out += `>${text}</a>`
    return out
  }

  renderer.code = function (code, language) {
    const validLang = !!(language && highlightjs.getLanguage(language))
    const highlighted = validLang
      ? highlightjs.highlight(language, code).value
      : code
    return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`
  }

  renderer.image = function (href, title, text) {
    if (href.startsWith('$')) {
      let id = href.substr(1)
      href = resolveUrl(baseURL, `/api/file/raw?id=${id}&entry=${entry}&access_token=${token}`)
    }
    let commands = (title || '').split(' ')
    title = []
    let iframe, width, height
    for (let command of commands) {
      if (command.startsWith('$')) {
        iframe |= command === '$iframe'
        if (command.startsWith('$width=')) width = command.substr(7)
        if (command.startsWith('$height=')) height = command.substr(8)
      } else {
        title.push(command)
      }
    }
    let out = iframe ? '<iframe' : '<img'
    out += ` src="${href}" alt="${text}"`
    if (width) out += ` width="${width}"`
    if (height) out += ` height="${height}"`
    if (title) out += ` title="${title.join(' ')}"`
    out += this.options.xhtml ? '/>' : '>'
    return out
  }

  zmark.setOptions({
    renderer: renderer,
    math: (text, display) => katex.renderToString(text, { displayMode: display })
  })

  return function (problem, context, theme) {
    const resources = [
      join("assets", "hljsdark.css"),
      join("assets", "hljslight.css"),
      join("assets", "mddark.css"),
      join("assets", "mdlight.css"),
      join("node_modules", "katex", "dist", "katex.min.css"),
    ]
      .map(x => join(context.extensionPath, x))
      .map(x => vscode.Uri.file(x))
      .map(x => x.with({ scheme: 'vscode-resource' }))
      .map(x => `<link rel="stylesheet" type="text/css" href="${x}">`)
      .join('\n')
    try {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${resources}
</head>
<body>
  <article class="markdown-body-${theme}">
      ${zmark(problem.content || '# Nothing to shown')}
  </article>
</body>
</html>`
    } catch (e) {
      return `<pre><code>${e.message}\n</code></pre>`
    }
  }
}

/**
 * DOM helpers — createElement wrapper and auto-escaping html template.
 * window.CCPDom
 */
(function (global) {
    function escapeHtml(s) {
        if (global.CCPUtils && global.CCPUtils.escapeHtml) {
            return global.CCPUtils.escapeHtml(s);
        }
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Tagged template — interpolates values through escapeHtml.
     * @param {TemplateStringsArray} strings
     * @param {...*} values
     */
    function html(strings, ...values) {
        let out = '';
        for (let i = 0; i < strings.length; i++) {
            out += strings[i];
            if (i < values.length) {
                out += escapeHtml(values[i]);
            }
        }
        return out;
    }

    /**
     * Create an element with attributes and children.
     * @param {string} tag
     * @param {Record<string, *>} [attrs]
     * @param {...(Node|string)} children
     */
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        if (attrs && typeof attrs === 'object') {
            Object.entries(attrs).forEach(([key, val]) => {
                if (val == null || val === false) {
                    return;
                }
                if (key === 'className') {
                    node.className = String(val);
                    return;
                }
                if (key === 'dataset' && val && typeof val === 'object') {
                    Object.entries(val).forEach(([dk, dv]) => {
                        if (dv != null) {
                            node.dataset[dk] = String(dv);
                        }
                    });
                    return;
                }
                if (key.startsWith('on') && typeof val === 'function') {
                    node.addEventListener(key.slice(2).toLowerCase(), val);
                    return;
                }
                if (val === true) {
                    node.setAttribute(key, '');
                    return;
                }
                node.setAttribute(key, String(val));
            });
        }
        const flat = children.flat();
        flat.forEach((child) => {
            if (child == null) {
                return;
            }
            if (child instanceof Node) {
                node.appendChild(child);
                return;
            }
            node.appendChild(document.createTextNode(String(child)));
        });
        return node;
    }

    function setTrustedHtml(node, markup) {
        if (!node) {
            return;
        }
        node.innerHTML = markup;
    }

    global.CCPDom = {
        html,
        el,
        escapeHtml,
        setTrustedHtml
    };
})(typeof window !== 'undefined' ? window : globalThis);

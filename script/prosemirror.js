(function () {
    function initializeCatmenuProsemirror() {
        if (window.__catmenuProsemirrorInitialized) return;
        if (!window.Prosemirror || !window.Prosemirror.classes) return;
        window.__catmenuProsemirrorInitialized = true;

        const {classes: {MenuItem, AbstractMenuItemDispatcher}} = window.Prosemirror;
        const i18n = (window.LANG && LANG.plugins && LANG.plugins.catmenu) ? LANG.plugins.catmenu : {};
        function hiddenMenuItem() {
            return new MenuItem({
                label: '',
                render: () => {
                    const el = document.createElement('span');
                    el.style.display = 'none';
                    return el;
                },
                command: () => false
            });
        }

        function t(key, fallback) {
            return i18n[key] || fallback;
        }

        function shouldShowInEditorMenu() {
            const raw = window.JSINFO &&
                JSINFO.plugins &&
                JSINFO.plugins.catmenu
                ? JSINFO.plugins.catmenu.show_in_editor_menu
                : true;

            if (typeof raw === 'boolean') return raw;
            const normalized = String(raw).trim().toLowerCase();
            return !(normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no');
        }

        window.Prosemirror.pluginSchemas.push((nodes, marks) => {
            nodes = nodes.addToEnd('catmenu', {
                group: 'protected_block',
                inline: false,
                selectable: true,
                draggable: true,
                defining: true,
                isolating: true,
                code: true,
                attrs: {
                    syntax: {default: '{{catmenu>.}}'}
                },
                toDOM: (node) => ['pre', {class: 'dwplugin', 'data-pluginname': 'catmenu'}, node.attrs.syntax],
                parseDOM: [{
                    tag: 'pre.dwplugin[data-pluginname="catmenu"]',
                    getAttrs: (dom) => ({syntax: (dom.textContent || '{{catmenu>.}}').trim()})
                }]
            });
            return {nodes, marks};
        });

        function parseCatmenuSyntax(syntax) {
            const m = (syntax || '').match(/^\{\{catmenu>(.*?)\}\}$/i);
            if (!m) return null;
            return {namespace: (m[1] || '.').trim() || '.'};
        }

        function buildCatmenuSyntax(values) {
            return '{{catmenu>' + ((values && values.namespace) ? values.namespace : '.') + '}}';
        }

        function formatCatmenuLabel(values) {
            return 'CatMenu: ' + (values.namespace || '.');
        }

        function getFolderIconUrl() {
            const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%232f6fae' d='M10 4l2 2h8a2 2 0 0 1 2 2v2H2V6a2 2 0 0 1 2-2h6z'/><path fill='%233f88c8' d='M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8z'/></svg>";
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        }

        function getFolderMenuIcon() {
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');

            const path1 = document.createElementNS(ns, 'path');
            path1.setAttribute('d', 'M10 4l2 2h8a2 2 0 0 1 2 2v2H2V6a2 2 0 0 1 2-2h6z');
            path1.setAttribute('fill', 'currentColor');
            svg.appendChild(path1);

            const path2 = document.createElementNS(ns, 'path');
            path2.setAttribute('d', 'M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8z');
            path2.setAttribute('fill', 'currentColor');
            svg.appendChild(path2);
            return svg;
        }

        function isLegacyCatmenuPluginNode(node) {
            return !!(
                node &&
                node.type &&
                (node.type.name === 'dwplugin_inline' || node.type.name === 'dwplugin_block') &&
                node.attrs &&
                node.attrs['data-pluginname'] === 'catmenu'
            );
        }

        function isCatmenuNode(node) {
            return !!(node && node.type && node.type.name === 'catmenu') || isLegacyCatmenuPluginNode(node);
        }

        function syntaxFromNode(node) {
            if (!node) return '{{catmenu>.}}';
            if (node.type && node.type.name === 'catmenu') {
                return String((node.attrs && node.attrs.syntax) || '{{catmenu>.}}');
            }
            return String(node.textContent || '{{catmenu>.}}');
        }

        function createCatmenuNode(schema, syntax) {
            const normalized = String(syntax || '{{catmenu>.}}').trim() || '{{catmenu>.}}';
            if (schema.nodes.catmenu) {
                return schema.nodes.catmenu.createChecked({syntax: normalized});
            }
            const fallback = schema.nodes.dwplugin_block;
            if (!fallback) return null;
            return fallback.createChecked(
                {class: 'dwplugin', 'data-pluginname': 'catmenu'},
                schema.text(normalized)
            );
        }

        function findCatmenuAtSelection(state) {
            const {selection} = state;
            if (isCatmenuNode(selection.node)) {
                return {node: selection.node, pos: selection.from};
            }

            const $from = selection.$from;
            if ($from.depth > 0 && isCatmenuNode($from.parent)) {
                return {node: $from.parent, pos: $from.before($from.depth)};
            }
            if (isCatmenuNode($from.nodeBefore)) {
                return {node: $from.nodeBefore, pos: $from.pos - $from.nodeBefore.nodeSize};
            }
            if (isCatmenuNode($from.nodeAfter)) {
                return {node: $from.nodeAfter, pos: $from.pos};
            }

            for (let depth = $from.depth; depth > 0; depth -= 1) {
                const ancestor = $from.node(depth);
                if (isCatmenuNode(ancestor)) {
                    return {node: ancestor, pos: $from.before(depth)};
                }
            }
            return null;
        }

        function insertParagraphAfterSelectedCatmenu(view) {
            if (!view || !view.state) return false;
            const selected = findCatmenuAtSelection(view.state);
            if (!selected) return false;

            const {schema} = view.state;
            const paragraph = schema.nodes.paragraph && schema.nodes.paragraph.createAndFill();
            if (!paragraph) return false;

            const insertPos = selected.pos + selected.node.nodeSize;
            let tr = view.state.tr.insert(insertPos, paragraph).scrollIntoView();
            view.dispatch(tr);

            try {
                const SelectionClass = view.state.selection.constructor;
                const $target = view.state.doc.resolve(insertPos + 1);
                const selection = SelectionClass.near($target, 1);
                view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
            } catch (e) {
                // Keep default selection on fallback.
            }

            view.focus();
            return true;
        }

        function insertCatmenuBlock(view, pluginNode) {
            const state = view.state;
            const {$from} = state.selection;
            const index = $from.index();

            if ($from.parent.canReplaceWith(index, index, pluginNode.type)) {
                view.dispatch(state.tr.replaceSelectionWith(pluginNode));
                return true;
            }

            for (let depth = $from.depth; depth > 0; depth -= 1) {
                const insertPos = $from.after(depth);
                try {
                    view.dispatch(state.tr.insert(insertPos, pluginNode));
                    return true;
                } catch (e) {
                    // try a higher ancestor
                }
            }
            return false;
        }

        function showCatmenuDialog(initialValues, onSubmit) {
            const values = {namespace: '.', ...initialValues};
            const $dialog = jQuery('<div class="plugin_catmenu_form" title="' + t('toolbar_popup_title', 'CatMenu') + '"></div>');

            $dialog.append('<label>' + t('toolbar_namespace', 'Namespace') + '</label>');
            const $namespace = jQuery('<input type="text" class="edit" style="width:100%;" />').val(values.namespace);
            $dialog.append($namespace);
            $dialog.append('<div style="font-size:.9em;color:#555;margin-top:4px;">' + t('toolbar_namespace_help', 'Folder. "." = current folder.') + '</div>');

            $dialog.dialog({
                modal: true,
                width: 460,
                close: function () {
                    jQuery(this).dialog('destroy').remove();
                },
                buttons: [
                    {
                        text: t('toolbar_insert', 'Insert'),
                        click: function () {
                            onSubmit({namespace: String($namespace.val() || '.').trim() || '.'});
                            jQuery(this).dialog('close');
                        }
                    },
                    {
                        text: t('toolbar_cancel', 'Cancel'),
                        click: function () {
                            jQuery(this).dialog('close');
                        }
                    }
                ]
            });
        }

        class CatmenuNodeView {
            constructor(node, view, getPos) {
                this.node = node;
                this.view = view;
                this.getPos = getPos;
                this.dom = document.createElement('div');
                const typeClass = (node.type && node.type.name === 'dwplugin_inline') ? 'pm_catmenu_inline' : 'pm_catmenu_block';
                this.dom.className = 'plugin_catmenu pm_catmenu_node nodeHasForm ' + typeClass;
                this.dom.setAttribute('contenteditable', 'false');
                this.render();

                this.dom.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.openEditor();
                });
            }

            render() {
                const syntax = syntaxFromNode(this.node);
                const parsed = parseCatmenuSyntax(syntax);
                const label = parsed ? formatCatmenuLabel(parsed) : syntax;
                this.dom.textContent = '';

                const icon = document.createElement('img');
                icon.className = 'pm_catmenu_icon';
                icon.src = getFolderIconUrl();
                icon.alt = '';
                icon.setAttribute('aria-hidden', 'true');
                this.dom.appendChild(icon);

                const text = document.createElement('span');
                text.textContent = label;
                this.dom.appendChild(text);
                this.dom.setAttribute('title', syntax);
            }

            openEditor() {
                const parsed = parseCatmenuSyntax(syntaxFromNode(this.node)) || {namespace: '.'};
                showCatmenuDialog(parsed, (values) => {
                    const syntax = buildCatmenuSyntax(values);
                    const replacement = createCatmenuNode(this.view.state.schema, syntax);
                    if (!replacement) return;

                    const pos = this.getPos();
                    this.view.dispatch(this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, replacement));
                    this.view.focus();
                });
            }

            update(node) {
                if (!isCatmenuNode(node)) return false;
                this.node = node;
                const typeClass = (node.type && node.type.name === 'dwplugin_inline') ? 'pm_catmenu_inline' : 'pm_catmenu_block';
                this.dom.className = 'plugin_catmenu pm_catmenu_node nodeHasForm ' + typeClass;
                this.render();
                return true;
            }

            selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
            deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }
            stopEvent() { return true; }
            ignoreMutation() { return true; }
        }

        class CatmenuMenuItemDispatcher extends AbstractMenuItemDispatcher {
            static isAvailable(schema) {
                return !!(schema.nodes.catmenu || schema.nodes.dwplugin_block);
            }

            static getIcon() {
                const wrapper = document.createElement('span');
                wrapper.className = 'menuicon';
                wrapper.appendChild(getFolderMenuIcon());
                return wrapper;
            }

            static getMenuItem(schema) {
                if (!this.isAvailable(schema)) return hiddenMenuItem();

                return new MenuItem({
                    label: t('toolbar_button', 'CatMenu'),
                    icon: this.getIcon(),
                    command: (state, dispatch, view) => {
                        const existing = findCatmenuAtSelection(state);
                        if (!dispatch || !view) return true;

                        const initialValues = existing
                            ? (parseCatmenuSyntax(syntaxFromNode(existing.node)) || {namespace: '.'})
                            : {namespace: '.'};

                        showCatmenuDialog(initialValues, (values) => {
                            const syntax = buildCatmenuSyntax(values);
                            const pluginNode = createCatmenuNode(schema, syntax);
                            if (!pluginNode) return;

                            if (existing) {
                                view.dispatch(view.state.tr.replaceWith(existing.pos, existing.pos + existing.node.nodeSize, pluginNode));
                            } else if (!insertCatmenuBlock(view, pluginNode)) {
                                const endPos = view.state.doc.content.size;
                                view.dispatch(view.state.tr.insert(endPos, pluginNode));
                            }
                            view.focus();
                        });

                        return true;
                    }
                });
            }
        }

        window.Prosemirror.pluginNodeViews.catmenu = (node, view, getPos) => new CatmenuNodeView(node, view, getPos);

        const originalInline = window.Prosemirror.pluginNodeViews.dwplugin_inline;
        window.Prosemirror.pluginNodeViews.dwplugin_inline = (node, view, getPos) => {
            if (isLegacyCatmenuPluginNode(node)) return new CatmenuNodeView(node, view, getPos);
            return typeof originalInline === 'function' ? originalInline(node, view, getPos) : undefined;
        };

        const originalBlock = window.Prosemirror.pluginNodeViews.dwplugin_block;
        window.Prosemirror.pluginNodeViews.dwplugin_block = (node, view, getPos) => {
            if (isLegacyCatmenuPluginNode(node)) return new CatmenuNodeView(node, view, getPos);
            return typeof originalBlock === 'function' ? originalBlock(node, view, getPos) : undefined;
        };

        if (shouldShowInEditorMenu()) {
            window.Prosemirror.pluginMenuItemDispatchers.push(CatmenuMenuItemDispatcher);
        }

        if (!window.__catmenuKeyboardGuardInstalled) {
            window.__catmenuKeyboardGuardInstalled = true;
            document.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                const view = window.Prosemirror && window.Prosemirror.view;
                if (!view || !view.state) return;
                if (!findCatmenuAtSelection(view.state)) return;
                event.preventDefault();
                event.stopPropagation();
                insertParagraphAfterSelectedCatmenu(view);
            }, true);
        }
    }

    jQuery(document).on('PROSEMIRROR_API_INITIALIZED', initializeCatmenuProsemirror);
    initializeCatmenuProsemirror();
})();

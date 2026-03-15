(function loadCatmenuProsemirrorAddon() {
    if (window.__catmenuPmAddonRequested) return;
    window.__catmenuPmAddonRequested = true;

    var base = (typeof DOKU_BASE !== 'undefined' && DOKU_BASE) ? DOKU_BASE : '/';
    var src = base + 'lib/plugins/catmenu/script/prosemirror.js';
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
})();

/**
 * Hauteur minimale (px) pour le sous-menu ouvert.
 * Évite un sous-menu trop petit sur les pages courtes.
 */
const CATMENU_MIN_SUBMENU_HEIGHT = 500;

/**
 * Ajuste la hauteur maximale du sous-menu ouvert en fonction de l'espace disponible.
 * Retourne la hauteur calculée.
 */
function catmenu_adjustSubmenuHeight(submenu, menuContainer) {
    var allTitles = menuContainer.querySelectorAll('.menu-item .header:not(.menu-item .menu-item .header)');

    // Hauteur totale du conteneur
    var containerHeight = menuContainer.clientHeight;

    // Somme des hauteurs des titres de premier niveau (bordures + padding + margin)
    var titlesHeight = Array.from(allTitles).reduce((sum, title) => {
        var computedStyle = window.getComputedStyle(title.parentElement);
        var marginTop = parseInt(computedStyle.marginTop) || 0;
        return sum + title.offsetHeight + marginTop;
    }, 0);

    // Hauteur disponible, avec plancher minimal
    var availableHeight = Math.max(
        Math.max(containerHeight, window.innerHeight) - titlesHeight - menuContainer.getBoundingClientRect().top,
        CATMENU_MIN_SUBMENU_HEIGHT
    );

    submenu.style.maxHeight = availableHeight + 'px';
    return availableHeight;
}

/**
 * Copie un texte dans le presse-papiers.
 * Utilise l'API Clipboard moderne (HTTPS), avec fallback execCommand pour
 * les contextes non-sécurisés ou les navigateurs anciens.
 */
function copyToClipboard(text) {
    if (!text) return;

    if (navigator.clipboard && window.isSecureContext) {
        // Méthode moderne (nécessite HTTPS)
        navigator.clipboard.writeText(text)
            .then(() => {
                catmenu_showNotification('URL copiée dans le presse-papiers !');
            })
            .catch(err => {
                console.error('Catmenu — erreur lors de la copie :', err);
            });
    } else {
        // Fallback pour contextes non-sécurisés / anciens navigateurs
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity  = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            catmenu_showNotification('URL copiée dans le presse-papiers !');
        } catch (err) {
            console.error('Catmenu — erreur lors de la copie (fallback) :', err);
        }
        document.body.removeChild(textarea);
    }
}

/**
 * Affiche une notification discrète (toast) pendant 2 secondes.
 * Préfère la notification DokuWiki si disponible, sinon affiche un toast minimal.
 */
function catmenu_showNotification(message) {
    if (typeof dw_alert === 'function') {
        dw_alert(message);
        return;
    }

    // Toast léger autonome
    let toast = document.getElementById('catmenu_toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'catmenu_toast';
        Object.assign(toast.style, {
            position:     'fixed',
            bottom:       '20px',
            right:        '20px',
            background:   '#333',
            color:        '#fff',
            padding:      '8px 14px',
            borderRadius: '4px',
            zIndex:       '99999',
            fontSize:     '13px',
            opacity:      '0',
            transition:   'opacity 0.3s',
            pointerEvents: 'none',
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

/**
 * Échappe les caractères spéciaux pour une utilisation sûre dans un attribut HTML.
 */
function catmenu_escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function catmenu_escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalise un titre en identifiant de page DokuWiki :
 * suppression des diacritiques, mise en minuscules, remplacement des
 * caractères non-alphanumériques par le séparateur configuré.
 */
function catmenu_normalizePageId(text, conf) {
    const sep        = (conf && conf.sepchar) ? conf.sepchar : '_';
    const sepPattern = new RegExp(catmenu_escapeRegExp(sep) + '+', 'g');
    const trimPattern = new RegExp('^' + catmenu_escapeRegExp(sep) + '+|' + catmenu_escapeRegExp(sep) + '+$', 'g');

    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, sep)
        .replace(sepPattern, sep)
        .replace(trimPattern, '');
}

/**
 * Fallback de création de page par saisie directe (invite navigateur),
 * utilisé si le plugin newpagefill n'est pas disponible.
 */
function catmenu_promptNewPageFallback(namespace, conf, urlSeparator) {
    const raw = window.prompt('Identifiant de la page à créer ?');
    if (!raw) return;

    const pageTitle = String(raw).trim();
    if (!pageTitle) return;
    const pageId = catmenu_normalizePageId(pageTitle, conf);
    if (!pageId) return;

    let targetUrl;
    if (Number(conf.userewrite) === 1) {
        const root = (typeof DOKU_BASE !== 'undefined' && DOKU_BASE ? DOKU_BASE : '/').replace(/\/$/, '');
        const cleanedNamespace = String(namespace || '').trim().replace(/^:+|:+$/g, '');
        const baseHref = cleanedNamespace
            ? root + '/' + cleanedNamespace.split(':').map(encodeURIComponent).join('/')
            : root;
        targetUrl = baseHref + urlSeparator + encodeURIComponent(pageId);
    } else {
        const root = typeof DOKU_BASE !== 'undefined' && DOKU_BASE ? DOKU_BASE : '/';
        const cleanedNamespace = String(namespace || '').trim().replace(/^:+|:+$/g, '');
        const parts = [];
        if (cleanedNamespace) parts.push(cleanedNamespace);
        parts.push(pageId);
        targetUrl = root;
        targetUrl += (targetUrl.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(parts.join(':'));
    }
    targetUrl += (targetUrl.indexOf('?') >= 0 ? '&' : '?') + 'do=edit';
    window.location.href = targetUrl;
}

/**
 * Ouvre ou ferme le sous-menu d'un item, en fermant les autres items de premier niveau.
 */
function catmenu_toggleSectionMenu(menuItem, menuContainer) {
    let isOpen = !menuItem.classList.contains('open');

    let topMenuItems = Array.from(menuContainer.querySelectorAll('.menu-item:not(.menu-item .menu-item)'));

    let currentTopMenu  = topMenuItems.find(item => item.contains(menuItem));
    let othersTopMenu   = topMenuItems.filter(item => item !== currentTopMenu);

    // Fermer tous les autres items de premier niveau
    othersTopMenu.forEach(item => {
        item.classList.remove('open');
        let submenu = item.getElementsByClassName('submenu')[0];
        if (submenu) {
            submenu.style.maxHeight = null;
        }
    });

    let currentTopSubmenu = currentTopMenu.getElementsByClassName('submenu')[0];
    if (isOpen) {
        let newHeight = catmenu_adjustSubmenuHeight(currentTopSubmenu, menuContainer);

        // Défilement automatique vers l'item actif si le contenu déborde
        setTimeout(() => {
            let hasOverflow = currentTopSubmenu.scrollHeight > newHeight;
            if (hasOverflow) {
                currentTopSubmenu.scrollTo({
                    top: menuItem.offsetTop - currentTopSubmenu.offsetTop - 15,
                });
            }
        }, 0);
    } else {
        currentTopSubmenu.style.maxHeight = null;
    }
    menuItem.classList.toggle('open');
}

/**
 * Construit récursivement le menu à partir des données JSON fournies par le serveur.
 *
 * @param {Object}      conf          Configuration DokuWiki (userewrite, start, sepchar)
 * @param {Array}       menuData      Tableau d'items de menu (titre, url, icône, sous-arbre…)
 * @param {HTMLElement} parentElement Conteneur dans lequel insérer les items
 * @param {HTMLElement} [menuContainer] Conteneur racine (passé en récursion)
 */
function catmenu_generateSectionMenu(conf, menuData, parentElement, menuContainer = null) {
    const URL_SEPARATOR = conf.userewrite == 1 ? '/' : ':';

    const AUTH_READ   = 1;
    const AUTH_EDIT   = 2;
    const AUTH_CREATE = 4;
    const AUTH_UPLOAD = 8;
    const AUTH_DELETE = 16;

    menuData.forEach(item => {
        let menuItem = document.createElement('div');
        menuItem.classList.add('menu-item');

        let header = document.createElement('div');
        header.classList.add('header');
        header.dataset.folderNamespace    = item.folderNamespace    || '';
        header.dataset.permission         = item.permission         || 0;
        header.dataset.pagesiconUploadUrl = item.pagesiconUploadUrl || '';
        header.dataset.href               = item.url                || '';

        if (item.icon) {
            let icon     = document.createElement('img');
            icon.classList.add('icon');
            icon.loading = 'lazy';
            icon.src     = item.icon;
            header.appendChild(icon);
        }

        let title;
        if (item.url) {
            title      = document.createElement('a');
            title.href = item.url;
        } else {
            title = document.createElement('span');
        }
        title.textContent = item.title;
        header.title      = item.title;
        header.appendChild(title);

        // Mise en évidence de la page courante
        let isCurrent = (':' + JSINFO.id + ':').indexOf(':' + item.namespace + ':') >= 0;
        if (isCurrent) {
            header.classList.add('current');
            menuItem.classList.add('open');
        }
        menuItem.appendChild(header);
        parentElement.appendChild(menuItem);

        if (item.subtree && item.subtree.length > 0) {
            header.classList.add('arrow');

            let submenu = document.createElement('div');
            submenu.classList.add('submenu');

            catmenu_generateSectionMenu(conf, item.subtree, submenu, menuContainer ?? parentElement);
            menuItem.appendChild(submenu);

            header.addEventListener('click', (event) => {
                const isLinkClick = !!event.target.closest('a');
                if (isLinkClick) {
                    // Un clic sur le lien ne doit pas fermer la section déjà ouverte
                    if (!menuItem.classList.contains('open')) {
                        catmenu_toggleSectionMenu(menuItem, menuContainer ?? parentElement);
                    }
                    return;
                }
                catmenu_toggleSectionMenu(menuItem, menuContainer ?? parentElement);
            });
        }
    });

    // Initialisations au niveau racine uniquement (évite les doublons en récursion)
    if (!menuContainer) {
        // Recalcul de la hauteur lors d'un redimensionnement de la fenêtre
        window.addEventListener('resize', () => {
            let openedTopSubmenu = parentElement.querySelector('.menu-item:not(.menu-item .menu-item).open > .submenu');
            if (openedTopSubmenu) {
                catmenu_adjustSubmenuHeight(openedTopSubmenu, parentElement);
            }
        }, false);

        // ── Menu contextuel (clic droit) ──────────────────────────────────────
        // Un seul élément contextMenu est créé dans le DOM et réutilisé.
        let contextMenu = document.getElementById('catmenu_contextMenu');
        if (!contextMenu) {
            contextMenu = document.createElement('div');
            contextMenu.id = 'catmenu_contextMenu';
            document.body.appendChild(contextMenu);

            // Fermeture du menu contextuel sur clic ailleurs
            document.addEventListener('click', function () {
                contextMenu.style.display = 'none';
            });

            // Délégation d'événements pour toutes les actions du menu contextuel
            contextMenu.addEventListener('click', function (event) {
                const action = event.target.closest('[data-action]');
                if (!action) return;

                const actionType = action.dataset.action;

                if (actionType === 'newPage') {
                    event.preventDefault();
                    event.stopPropagation();
                    contextMenu.style.display = 'none';
                    const ns = contextMenu.dataset.newPageNamespace || '';
                    if (!window.NewPageFill || typeof window.NewPageFill.openCreatePageDialog !== 'function') {
                        catmenu_promptNewPageFallback(ns, conf, URL_SEPARATOR);
                        return;
                    }
                    window.NewPageFill.openCreatePageDialog({
                        namespace:    ns,
                        sepchar:      conf.sepchar,
                        initialTitle: '',
                    });
                }

                if (actionType === 'copy') {
                    event.preventDefault();
                    event.stopPropagation();
                    contextMenu.style.display = 'none';
                    copyToClipboard(action.dataset.href || '');
                }

                if (actionType === 'medias') {
                    event.preventDefault();
                    event.stopPropagation();
                    contextMenu.style.display = 'none';
                    const ns  = action.dataset.ns || '';
                    const url = '/lib/exe/mediamanager.php?ns=' + encodeURIComponent(ns);
                    window.open(url, 'CatmenuMediasPopup', 'width=800,height=600,resizable=yes,scrollbars=yes');
                }
            });
        }

        // Actions activées dans la configuration du plugin (depuis JSINFO)
        const enabledItems = new Set(
            (JSINFO?.plugins?.catmenu?.context_menu_items) || ['newpage', 'reload', 'medias', 'pagesicon', 'url']
        );
        const footerContentHtml = String(JSINFO?.plugins?.catmenu?.footer_content_html || '').trim();
        // Disponibilité du plugin pagesicon côté serveur
        const pagesiconAvailable = !!(JSINFO?.plugins?.catmenu?.pagesicon_available);

        // Ouverture du menu contextuel sur clic droit dans le catmenu
        document.addEventListener('contextmenu', function (event) {
            let header = event.target.closest('.header');
            if (!header || !header.closest('.catmenu')) {
                contextMenu.style.display = 'none';
                return;
            }
            // Ignorer si l'en-tête appartient à un autre catmenu sur la page
            if (!parentElement.contains(header)) {
                return;
            }
            event.preventDefault();

            let permission = Number(header.dataset.permission) || 0;
            let href       = header.dataset.href               || '';
            let folderNs   = header.dataset.folderNamespace    || '';

            // Titre de la section (texte brut, sans HTML)
            let titleText = header.querySelector('a, span')?.textContent || header.title || '';

            // Construction du menu par manipulation DOM (pas de innerHTML + données)
            contextMenu.innerHTML = '';

            let titleEl = document.createElement('p');
            let titleBold = document.createElement('b');
            titleBold.textContent = titleText;
            titleEl.appendChild(titleBold);
            contextMenu.appendChild(titleEl);

            let hasActions = false;

            // Créer une nouvelle page
            if (enabledItems.has('newpage') && permission >= AUTH_CREATE) {
                contextMenu.dataset.newPageNamespace = folderNs;
                let btn = document.createElement('div');
                btn.className      = 'button';
                btn.dataset.action = 'newPage';
                btn.textContent    = '📝 Créer une nouvelle page';
                contextMenu.appendChild(btn);
                hasActions = true;
            }

            // Recharger le cache
            if (enabledItems.has('reload') && href && permission >= AUTH_EDIT) {
                let btn = document.createElement('a');
                btn.className      = 'button';
                btn.dataset.action = 'reload';
                btn.href           = href + (href.indexOf('?') >= 0 ? '&' : '?') + 'purge=true';
                btn.textContent    = '🔄 Recharger le cache';
                contextMenu.appendChild(btn);
                hasActions = true;
            }

            // Gérer les médias
            if (enabledItems.has('medias') && permission >= AUTH_UPLOAD) {
                let btnMedia = document.createElement('div');
                btnMedia.className      = 'button';
                btnMedia.dataset.action = 'medias';
                btnMedia.dataset.ns     = folderNs;
                btnMedia.textContent    = '🖼️ Gérer les médias';
                contextMenu.appendChild(btnMedia);
                hasActions = true;
            }

            // Gérer l'icône — uniquement si l'option est activée ET pagesicon est installé
            if (enabledItems.has('pagesicon') && pagesiconAvailable && permission >= AUTH_UPLOAD) {
                let iconUrl = header.dataset.pagesiconUploadUrl || '';
                if (iconUrl) {
                    let btnIcon = document.createElement('a');
                    btnIcon.className      = 'button';
                    btnIcon.dataset.action = 'icon';
                    btnIcon.href           = iconUrl;
                    btnIcon.target         = '_blank';
                    btnIcon.textContent    = '🖼️ Gérer l\'icône';
                    contextMenu.appendChild(btnIcon);
                    hasActions = true;
                }
            }

            // Copier l'URL
            if (enabledItems.has('url')) {
                let btnCopy = document.createElement('div');
                btnCopy.className      = 'button';
                btnCopy.dataset.action = 'copy';
                btnCopy.dataset.href   = href;
                btnCopy.textContent    = '📋 Copier l\'URL';
                contextMenu.appendChild(btnCopy);
                hasActions = true;
            }

            if (footerContentHtml) {
                let footer = document.createElement('div');
                footer.className = 'catmenu-footer';
                footer.innerHTML = footerContentHtml;
                contextMenu.appendChild(footer);
            }

            // N'afficher le menu que s'il contient au moins une action
            if (!hasActions && !footerContentHtml) return;

            // Positionnement et affichage
            contextMenu.style.left    = event.clientX + 'px';
            contextMenu.style.top     = event.clientY + 'px';
            contextMenu.style.display = 'block';

            contextMenu.dataset.namespace       = header.dataset.namespace || '';
            contextMenu.dataset.folderNamespace = folderNs;
        }, false);
    }
}

// Exposition globale — le rendu inline du PHP appelle cette fonction via window.
if (typeof window !== 'undefined') {
    window.catmenu_generateSectionMenu = catmenu_generateSectionMenu;
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new Event('catmenu:ready'));
    }
}

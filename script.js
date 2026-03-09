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

function catmenu_adjustSubmenuHeight(submenu, menuContainer) {
    var allTitles = menuContainer.querySelectorAll(`.menu-item .header:not(.menu-item .menu-item .header)`);
    
    // Hauteur totale du conteneur
    var containerHeight = menuContainer.clientHeight;
    
    // Calculer la hauteur des titres en incluant bordures, padding et margin-top
    var titlesHeight = Array.from(allTitles).reduce((sum, title) => {
        var computedStyle = window.getComputedStyle(title.parentElement);
        var marginTop = parseInt(computedStyle.marginTop) || 0;
        return sum + title.offsetHeight + marginTop;
    }, 0);
    
    // Définir la hauteur maximale en prenant en compte le padding et le margin-top
    var availableHeight = Math.max(Math.max(containerHeight, window.innerHeight) - titlesHeight - menuContainer.getBoundingClientRect().top, 500);
    
    submenu.style.maxHeight = availableHeight + "px";

    return availableHeight;
}

function copyToClipboard(text) {
    if (!text) return;

    // Méthode moderne (HTTPS requis)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => {
                alert("URL copiée dans le presse-papiers !");
            })
            .catch(err => {
                console.error("Erreur lors de la copie :", err);
            });
    } 
    // Fallback pour anciens navigateurs
    else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
            document.execCommand("copy");
            alert("URL copiée dans le presse-papiers !");
        } catch (err) {
            console.error("Erreur lors de la copie :", err);
        }

        document.body.removeChild(textarea);
    }
}

// Appeler cette fonction à l'ouverture d'un sous-menu
function catmenu_toggleSectionMenu(menuItem, menuContainer) {
    let isOpen = !menuItem.classList.contains('open');

    let topMenuItems = Array.from(menuContainer.querySelectorAll('.menu-item:not(.menu-item .menu-item)'));
        
    let currentTopMenu = topMenuItems.find(item => item.contains(menuItem));
    let othersTopMenu = Array.from(topMenuItems).filter(item => item !== currentTopMenu);
    
    othersTopMenu.forEach(item => {
        item.classList.remove("open");
        let submenu = item.getElementsByClassName('submenu')[0];
        if(submenu) {
            submenu.style.maxHeight = null;
        }
    });
    
    let currentTopSubmenu = currentTopMenu.getElementsByClassName('submenu')[0];
    if(isOpen) {
        let newHeight = catmenu_adjustSubmenuHeight(currentTopSubmenu, menuContainer);

        setTimeout(() => {
            let hasOverflow = currentTopSubmenu.scrollHeight > newHeight;
            if(hasOverflow) {
                console.log(menuItem.offsetTop-currentTopSubmenu.offsetTop, currentTopSubmenu, currentTopSubmenu.offsetTop, menuItem, menuItem.offsetTop);
                currentTopSubmenu.scrollTo({
                    top: menuItem.offsetTop-currentTopSubmenu.offsetTop-5-10
                });
            }
        }, 0);
    }
    else {
        currentTopSubmenu.style.maxHeight = null;
    }
    menuItem.classList.toggle('open');
}

function catmenu_generateSectionMenu(conf, menuData, parentElement, menuContainer = null) {
    const URL_SEPARATOR = conf.userewrite == 1? '/' : ':';

    const AUTH_READ = 1;
    const AUTH_EDIT = 2;
    const AUTH_CREATE = 4;
    const AUTH_UPLOAD = 8;
    const AUTH_DELETE = 16;

    menuData.forEach(item => { // Pour tous les éléments
        let menuItem = document.createElement("div");
        menuItem.classList.add("menu-item");

        let header = document.createElement("div");
        header.classList.add("header");
        header.dataset.folderNamespace = item.folderNamespace;
        header.dataset.permission = item.permission;
        header.dataset.pagesiconUploadUrl = item.pagesiconUploadUrl || '';

        if (item.icon) {
            let icon = document.createElement("img");
            icon.classList.add("icon");
            icon.loading = "lazy";
            icon.src = item.icon; 
            header.appendChild(icon);
        }

        let title;
        if(item.url) {
            title = document.createElement("a");
            title.href = item.url;
            header.dataset.href = item.url;
        }
        else {
            title = document.createElement("span");
        }
        title.textContent = item.title;
        header.title = item.title;
        header.appendChild(title);
        
        let isCurrent = (':' + JSINFO.id + ':').indexOf(':' + item.namespace + ':') >= 0;
        if(isCurrent) {
            header.classList.add("current");
            menuItem.classList.add("open");
        }
        menuItem.appendChild(header);

        parentElement.appendChild(menuItem);

        if (item.subtree && item.subtree.length > 0) {
            header.classList.add("arrow");

            let submenu = document.createElement("div");
            submenu.classList.add("submenu");

            catmenu_generateSectionMenu(conf, item.subtree, submenu, menuContainer ?? parentElement);
            menuItem.appendChild(submenu);

            header.addEventListener("click", (event) => {
                const isLinkClick = !!event.target.closest("a");
                if (isLinkClick) {
                    // Clicking section link should never close it.
                    if (!menuItem.classList.contains("open")) {
                        catmenu_toggleSectionMenu(menuItem, menuContainer ?? parentElement);
                    }
                    return;
                }
                catmenu_toggleSectionMenu(menuItem, menuContainer ?? parentElement);
            });
        }
    });


    if(!menuContainer) {
        window.addEventListener('resize', () => {
            let openedTopSubmenu = parentElement.querySelector('.menu-item:not(.menu-item .menu-item).open > .submenu');
            if(openedTopSubmenu) {
                catmenu_adjustSubmenuHeight(openedTopSubmenu, parentElement);
            }
        }, false);

        let contextMenu = document.getElementById('catmenu_contextMenu');
        if(!contextMenu) {
            contextMenu = document.createElement('div');
            contextMenu.id = 'catmenu_contextMenu';
            document.body.appendChild(contextMenu);
            document.addEventListener('click', function() {
                contextMenu.style.display = 'none';
            });

            contextMenu.addEventListener('click', function() {
                console.log(`Click`, contextMenu.dataset.namespace);
            });
        }

        function appendToUrl(base, params) {
            return base + (base.indexOf('?') >= 0? '&' : '?') + params;
        }

        document.addEventListener('contextmenu', function(event) {
            let header = event.target.closest(".header"); // Vérifie si clic sur un menu
            if (!header || !header.closest('.catmenu')) {
                contextMenu.style.display = 'none';
                return;
            }

            if(!parentElement.contains(header)) {
                return;
            }
            event.preventDefault(); // Empêche le menu par défaut

            let permission = header.dataset.permission;

            let htmlActions = '';
            if(permission >= AUTH_CREATE) {
                let baseHref = header.dataset.href;
                if(baseHref.endsWith(URL_SEPARATOR + conf.start)) {
                    baseHref = baseHref.slice(0, -(URL_SEPARATOR + conf.start).length);
                }
                htmlActions += '<div class="button" data-action="newPage" onclick="let nomPage = prompt(\'Identifiant de la page à créer ?\'); if(nomPage) window.location.href = \'' + appendToUrl(baseHref + URL_SEPARATOR + '\' + encodeURIComponent(nomPage) + \'' + URL_SEPARATOR + conf.start, 'do=edit') + '\';">📝 Créer une nouvelle page</div>';
            }
            if(header.dataset.href && permission >= AUTH_EDIT) {
                htmlActions += '<a class="button" data-action="reload" href="' + appendToUrl(header.dataset.href, 'purge=true') + '">🔄 Recharger le cache</a>';
            }
            if(permission >= AUTH_UPLOAD) {
                htmlActions += '<a class="button" data-action="medias" target="_blank" href="' + appendToUrl('/lib/exe/mediamanager.php', 'ns=' + header.dataset.folderNamespace) + '" onclick="event.preventDefault();window.open(\'' + appendToUrl('/lib/exe/mediamanager.php', 'ns=' + header.dataset.folderNamespace) + '\', \'MediasPopup\', \'width=800,height=600,resizable=yes,scrollbars=yes\');">🖼️ Gérer les médias</a>';
                if (header.dataset.pagesiconUploadUrl) {
                    htmlActions += '<a class="button" data-action="icon" target="_blank" href="' + header.dataset.pagesiconUploadUrl + '">🖼️ Gérer l\'icône</a>';
                }
            }
            htmlActions += '<div class="button" data-action="copy" onclick="copyToClipboard(\'' + header.dataset.href + '\')">📋 Copier l\'url</div>';

            if(htmlActions) {
                let html = '<p><b>' + header.innerText + '</b></p>' + htmlActions;
                contextMenu.style.left = `${event.clientX}px`;
                contextMenu.style.top = `${event.clientY}px`;
                contextMenu.style.display = "block";
                contextMenu.innerHTML = html;

                // Stocke l'élément cliqué pour utilisation
                contextMenu.dataset.namespace = header.dataset.namespace;
                contextMenu.dataset.folderNamespace = header.dataset.folderNamespace;
            }
        }, false);
    }
}

// The syntax renderer calls this function from inline <script>.
// Expose it explicitly on window because bundled scopes may hide declarations.
if (typeof window !== 'undefined') {
    window.catmenu_generateSectionMenu = catmenu_generateSectionMenu;
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new Event('catmenu:ready'));
    }
}

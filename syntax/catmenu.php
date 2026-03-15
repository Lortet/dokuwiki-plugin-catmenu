<?php
/**
 * Plugin catmenu
 * Affiche les pages d'un namespace donné sous forme de menu hiérarchique.
 * Auteur: Lortetv
 */

use dokuwiki\Extension\SyntaxPlugin;
use dokuwiki\File\PageResolver;
use dokuwiki\Ui\Index;

class syntax_plugin_catmenu_catmenu extends SyntaxPlugin {
    /** @var helper_plugin_pagesicon|null|false */
    private $pagesiconHelper = false;

    /** @var helper_plugin_catmenu_namespace|null */
    private $nsHelper = null;

    /**
     * Retourne le helper namespace (chargé en lazy).
     */
    private function getNsHelper(): helper_plugin_catmenu_namespace
    {
        if ($this->nsHelper === null) {
            $this->nsHelper = $this->loadHelper('catmenu_namespace');
        }
        return $this->nsHelper;
    }

    public function getType() {
        return 'substition'; // substitution = remplacer la balise par du contenu
    }

    public function getPType() {
        return 'block';
    }

    public function getSort() { // priorité du plugin par rapport à d'autres
        return 15;
    }

    /**
     * Reconnaît la syntaxe {{catmenu>[namespace]}}
     */
    public function connectTo($mode) {
        $this->Lexer->addSpecialPattern('{{catmenu>.*?}}', $mode, 'plugin_catmenu_catmenu');
    }

    /**
     * Nettoie {{catmenu>[namespace]}} et extrait le namespace.
     */
    public function handle($match, $state, $pos, Doku_Handler $handler) {
        $namespace = trim(substr($match, 10, -2)); // retirer {{catmenu> et }}
        return ['namespace' => $namespace];
    }

    public function render($mode, Doku_Renderer $renderer, $data) {
        if ($mode !== 'xhtml') return false;

        global $ID;
        global $conf;

        $random = uniqid();
        $nsHelper = $this->getNsHelper();

        if ($data['namespace'] === '.') { // Résolution du namespace courant
            $namespace = $nsHelper->getCurrentNamespace($ID);
        } else {
            $namespace = cleanID($data['namespace']);
        }

        $pages = $this->getPagesAndSubfoldersItems($namespace);
        if ($pages === false) {
            $renderer->doc .= '<div>' . hsc($this->getLang('namespace_not_found')) . '</div>';
            return true;
        }

        $renderer->doc .= '<div id="catmenu_' . $random . '" class="catmenu" style=""></div>';
        $renderer->doc .= "<script>
            let catmenuconf_" . $random . " = { userewrite: '" . $conf['userewrite'] . "', start: '" . $conf['start'] . "' };
            let catmenuobj_" . $random . " = JSON.parse(`" . htmlspecialchars_decode(json_encode($pages)) . "`);
            (function initCatmenu_" . $random . "() {
                const target = document.getElementById('catmenu_" . $random . "');
                if (!target) return;
                const renderOnce = function () {
                    if (target.dataset.catmenuRendered === '1') return;
                    if (typeof window.catmenu_generateSectionMenu !== 'function') return;
                    target.dataset.catmenuRendered = '1';
                    target.innerHTML = '';
                    window.catmenu_generateSectionMenu(catmenuconf_" . $random . ", catmenuobj_" . $random . ", target);
                };
                if (typeof window.catmenu_generateSectionMenu === 'function') {
                    renderOnce();
                    return;
                }

                // En mode édition/aperçu, les scripts du plugin peuvent se charger
                // après le rendu inline — on attend l'événement catmenu:ready.
                document.addEventListener('catmenu:ready', function onReady() {
                    renderOnce();
                }, { once: true });

                setTimeout(function retryCatmenu_" . $random . "() {
                    renderOnce();
                }, 0);
            })();
        </script>";

        return true;
    }

    /**
     * Récupère à la fois les pages et les sous-dossiers d'un namespace.
     *
     * @return array|false  Tableau d'items ou false si le namespace n'existe pas
     */
    public function getPagesAndSubfoldersItems($namespace) {
        global $conf;
        $skipPageWithoutTitle = (bool)$this->getConf('skip_page_without_title');
        $nsHelper = $this->getNsHelper();

        $childrens = @scandir($nsHelper->namespaceDir($namespace));
        if ($childrens === false) {
            return false;
        }

        $start = $conf['start']; // page de démarrage (ex. 'accueil', 'start')

        $items = [];
        foreach ($childrens as $child) {
            if ($child[0] === '.') { // ignorer ., .. et fichiers cachés
                continue;
            }

            $childPathInfo  = pathinfo($child);
            $childID        = cleanID($childPathInfo['filename']);
            $childNamespace = cleanID($namespace !== '' ? ($namespace . ':' . $childID) : $childID);

            $childHasExtension = isset($childPathInfo['extension']) && $childPathInfo['extension'] !== '';
            $isDirNamespace    = is_dir($nsHelper->namespaceDir($childNamespace));
            $isPageNamespace   = page_exists($childNamespace);

            if (!$childHasExtension && $isDirNamespace) { // Dossier/namespace
                $pageNamespaceInfo = $nsHelper->getPageNamespaceInfo($childNamespace);
                if ($nsHelper->isHomepage($childID, (string)$pageNamespaceInfo['parentID'])) {
                    // Aplatir les dossiers "page d'accueil" (ex. ns:ns) — leurs enfants remontent d'un niveau.
                    $subItems = $this->getPagesAndSubfoldersItems($childNamespace);
                    if (is_array($subItems) && $subItems) {
                        $items = array_merge($items, $subItems);
                    }
                    continue;
                }

                $pageID = null;
                if (page_exists("$childNamespace:$start")) {
                    // Page d'accueil standard
                    $pageID = "$childNamespace:$start";
                } elseif (page_exists("$childNamespace:$childID")) {
                    // Page homonyme dans le dossier
                    $pageID = "$childNamespace:$childID";
                } elseif ($isPageNamespace) {
                    // Page homonyme au même niveau que le dossier
                    $pageID = cleanID($namespace !== '' ? ($namespace . ':' . $childID) : $childID);
                }

                $permission = auth_quickaclcheck($pageID);
                if ($permission < AUTH_READ) {
                    continue;
                }

                $title = $pageID ? p_get_first_heading($pageID) : $pageID;
                if (empty($title)) {
                    if ($skipPageWithoutTitle || empty($pageID)) {
                        continue;
                    }
                    $title = noNS($pageID);
                }

                $items[] = [
                    'title'              => $title,
                    'url'                => $pageID ? wl($pageID) : null,
                    'icon'               => $this->getPageImage($pageID),
                    'pagesiconUploadUrl' => $this->getPagesiconUploadUrl($pageID ?: $childNamespace),
                    'folderNamespace'    => $childNamespace,
                    'namespace'          => $childNamespace,
                    'subtree'            => $this->getPagesAndSubfoldersItems($childNamespace),
                    'permission'         => $permission,
                ];
                continue;
            }

            if (!$isDirNamespace && $isPageNamespace) { // Page seule
                $skipRegex = $this->resolveSkipRegex();
                if (!empty($skipRegex) && preg_match($skipRegex, $childNamespace)) {
                    continue;
                }

                $pageNamespaceInfo = $nsHelper->getPageNamespaceInfo("$namespace:$childID");
                if ($nsHelper->isHomepage($childID, $pageNamespaceInfo['parentID'])) {
                    continue;
                }

                $permission = auth_quickaclcheck($childNamespace);
                if ($permission < AUTH_READ) {
                    continue;
                }

                $title = p_get_first_heading($childNamespace);
                if (empty($title)) {
                    if ($skipPageWithoutTitle) {
                        continue;
                    }
                    $title = noNS($childNamespace);
                }

                $items[] = [
                    'title'              => $title,
                    'url'                => $childNamespace ? wl($childNamespace) : null,
                    'icon'               => $this->getPageImage($childNamespace),
                    'pagesiconUploadUrl' => $this->getPagesiconUploadUrl($childNamespace),
                    'folderNamespace'    => $namespace,
                    'namespace'          => $childNamespace,
                    'permission'         => $permission,
                ];
            }
        }

        return $items;
    }

    /**
     * Résout la valeur effective de l'option skip_file.
     *
     * Si la valeur est le jeton spécial "@hidepages", retourne la regex de masquage
     * de pages configurée globalement dans DokuWiki ($conf['hidepages']).
     * Sinon, retourne la valeur brute telle quelle.
     */
    private function resolveSkipRegex(): string
    {
        global $conf;
        $raw = (string)$this->getConf('skip_file');
        if (trim($raw) === '@hidepages') {
            return (string)($conf['hidepages'] ?? '');
        }
        return $raw;
    }

    /**
     * Retourne l'URL de la miniature d'icône via le helper pagesicon.
     * Retourne une chaîne vide si aucune icône n'est définie.
     */
    public function getPageImage($page) {
        if (!$page) return '';

        $page = cleanID((string)$page);
        if ($page === '') return '';

        /** @var helper_plugin_pagesicon|null $helper */
        $helper = plugin_load('helper', 'pagesicon');
        if (!$helper) return '';

        $namespace = getNS($page);
        $pageID    = noNS($page);

        // Nouvelle API pagesicon (préférée)
        if (method_exists($helper, 'getPageIconUrl')) {
            $mtime   = null;
            $iconUrl = $helper->getPageIconUrl($namespace, $pageID, 'smallorbig', ['width' => 55], $mtime, true);
            if ($iconUrl) return $iconUrl;
        } elseif (method_exists($helper, 'getImageIcon')) {
            $mtime                = null;
            $withDefaultSupported = false;
            try {
                $method               = new ReflectionMethod($helper, 'getImageIcon');
                $withDefaultSupported = $method->getNumberOfParameters() >= 6;
            } catch (ReflectionException $e) {
                $withDefaultSupported = false;
            }

            $iconUrl = $withDefaultSupported
                ? $helper->getImageIcon($namespace, $pageID, 'smallorbig', ['width' => 55], $mtime, true)
                : $helper->getImageIcon($namespace, $pageID, 'smallorbig', ['width' => 55], $mtime);
            if ($iconUrl) return $iconUrl;
        }

        // Fallback : récupération de l'ID média puis génération de l'URL
        $iconMediaID = false;
        if (method_exists($helper, 'getPageIconId')) {
            $iconMediaID = $helper->getPageIconId($namespace, $pageID, 'smallorbig');
        } elseif (method_exists($helper, 'getPageImage')) {
            $withDefaultSupported = false;
            try {
                $method               = new ReflectionMethod($helper, 'getPageImage');
                $withDefaultSupported = $method->getNumberOfParameters() >= 4;
            } catch (ReflectionException $e) {
                $withDefaultSupported = false;
            }

            $iconMediaID = $withDefaultSupported
                ? $helper->getPageImage($namespace, $pageID, 'smallorbig', true)
                : $helper->getPageImage($namespace, $pageID, 'smallorbig');
        }
        if (!$iconMediaID) return '';

        return ml($iconMediaID, ['width' => 55]);
    }

    /**
     * Retourne l'URL de la page d'upload d'icône pour un namespace (via pagesicon).
     */
    private function getPagesiconUploadUrl($namespace) {
        if ($this->pagesiconHelper === false) {
            $this->pagesiconHelper = plugin_load('helper', 'pagesicon');
        }
        if (!$this->pagesiconHelper) return null;
        if (!method_exists($this->pagesiconHelper, 'getUploadIconPage')) return null;

        return $this->pagesiconHelper->getUploadIconPage((string)$namespace);
    }
}

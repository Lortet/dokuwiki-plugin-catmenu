<?php

use dokuwiki\plugin\catmenu\parser\CatmenuNode;
use dokuwiki\plugin\prosemirror\schema\Node;

class action_plugin_catmenu_prosemirror extends \dokuwiki\Extension\ActionPlugin
{
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

    public function register(Doku_Event_Handler $controller)
    {
        $controller->register_hook('DOKUWIKI_STARTED',       'AFTER',  $this, 'addJsInfo');
        $controller->register_hook('PROSEMIRROR_RENDER_PLUGIN', 'BEFORE', $this, 'handleRender');
        $controller->register_hook('PROSEMIRROR_PARSE_UNKNOWN', 'BEFORE', $this, 'handleParseUnknown');
        $controller->register_hook('PLUGIN_PAGESICON_UPDATED',  'AFTER',  $this, 'handlePagesiconUpdated');
    }

    /**
     * Vérifie si une page contenant du catmenu est affectée par la mise à jour d'une icône.
     * Retourne true si au moins un bloc catmenu de la page couvre la page cible.
     */
    private function pageUsesAffectedCatmenu(string $hostPageID, string $content, string $targetPage): bool
    {
        if (!preg_match_all('/\{\{catmenu>(.*?)\}\}/i', $content, $matches, PREG_SET_ORDER)) return false;
        $nsHelper = $this->getNsHelper();
        foreach ($matches as $match) {
            $namespaceExpr = (string)($match[1] ?? '');
            $resolvedNS    = $nsHelper->resolveNamespaceExpression($namespaceExpr, $hostPageID);
            if ($nsHelper->isTargetInNamespace($targetPage, $resolvedNS)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Invalide les caches des pages contenant un bloc catmenu affecté.
     *
     * Si $targetPage est fourni, seules les pages dont le catmenu couvre réellement
     * cette page cible sont invalidées. Sinon, toutes les pages contenant catmenu
     * sont invalidées (fallback large).
     */
    private function invalidateCacheForTarget(string $targetPage = ''): void
    {
        global $conf;
        $datadir = rtrim((string)$conf['datadir'], '/');
        if ($datadir === '' || !is_dir($datadir)) return;

        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($datadir, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $fileinfo) {
            /** @var SplFileInfo $fileinfo */
            if (!$fileinfo->isFile()) continue;
            if (substr($fileinfo->getFilename(), -4) !== '.txt') continue;

            $path    = $fileinfo->getPathname();
            $content = @file_get_contents($path);
            // Pré-filtre rapide : ignorer les pages sans aucun bloc catmenu
            if ($content === false || strpos($content, '{{catmenu>') === false) continue;

            $id = pathID($path);
            if ($id === '') continue;

            // Filtre précis : n'invalider que si le namespace catmenu couvre réellement la cible
            if ($targetPage !== '' && !$this->pageUsesAffectedCatmenu($id, $content, $targetPage)) {
                continue;
            }

            $cache = new \dokuwiki\Cache\CacheRenderer($id, wikiFN($id), 'xhtml');
            $cache->removeCache();
        }
    }

    public function addJsInfo(Doku_Event $event)
    {
        global $ID;
        global $JSINFO;
        if (!isset($JSINFO['plugins'])) $JSINFO['plugins'] = [];
        if (!isset($JSINFO['plugins']['catmenu'])) $JSINFO['plugins']['catmenu'] = [];
        $JSINFO['plugins']['catmenu']['show_in_editor_menu'] = (bool)$this->getConf('show_in_editor_menu');

        // Actions activées dans le menu contextuel (issues de la config multicheckbox)
        $rawItems = (string)$this->getConf('context_menu_items');
        $JSINFO['plugins']['catmenu']['context_menu_items'] = array_values(
            array_filter(array_map('trim', explode(',', $rawItems)))
        );

        $pagesiconHelper = plugin_load('helper', 'pagesicon');
        $JSINFO['plugins']['catmenu']['pagesicon_available'] = (bool)$pagesiconHelper;
        if ($pagesiconHelper) {
            $JSINFO['plugins']['catmenu']['pagesicon_upload_url'] = wl((string)$ID, ['do' => 'pagesicon']);
        }
    }

    public function handleRender(Doku_Event $event)
    {
        $data = $event->data;
        if (($data['name'] ?? '') !== 'catmenu_catmenu') return;

        $event->preventDefault();
        $event->stopPropagation();

        $syntax = trim((string)($data['match'] ?? ''));
        if ($syntax === '') {
            $syntax = '{{catmenu>.}}';
        }

        $node = new Node('dwplugin_block');
        $node->attr('class', 'dwplugin');
        $node->attr('data-pluginname', 'catmenu');

        $textNode = new Node('text');
        $textNode->setText($syntax);
        $node->addChild($textNode);

        $data['renderer']->addToNodestack($node);
    }

    public function handleParseUnknown(Doku_Event $event)
    {
        if (($event->data['node']['type'] ?? '') !== 'catmenu') return;

        $event->data['newNode'] = new CatmenuNode($event->data['node'], $event->data['parent']);
        $event->preventDefault();
        $event->stopPropagation();
    }

    public function handlePagesiconUpdated(Doku_Event $event): void
    {
        // Récupération de la page cible depuis les données de l'événement pagesicon.
        // Si la donnée n'est pas disponible, on invalide de façon large (toutes les pages catmenu).
        $targetPage = (string)($event->data['page'] ?? $event->data['id'] ?? '');
        $this->invalidateCacheForTarget($targetPage);
    }
}

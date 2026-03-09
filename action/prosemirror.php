<?php

use dokuwiki\plugin\catmenu\parser\CatmenuNode;
use dokuwiki\plugin\prosemirror\schema\Node;

class action_plugin_catmenu_prosemirror extends \dokuwiki\Extension\ActionPlugin
{
    public function register(Doku_Event_Handler $controller)
    {
        $controller->register_hook('DOKUWIKI_STARTED', 'AFTER', $this, 'addJsInfo');
        $controller->register_hook('PROSEMIRROR_RENDER_PLUGIN', 'BEFORE', $this, 'handleRender');
        $controller->register_hook('PROSEMIRROR_PARSE_UNKNOWN', 'BEFORE', $this, 'handleParseUnknown');
        $controller->register_hook('PLUGIN_PAGESICON_UPDATED', 'AFTER', $this, 'handlePagesiconUpdated');
    }

    private function namespaceDir(string $namespace): string
    {
        global $conf;
        return rtrim((string)$conf['datadir'], '/') . '/' . utf8_encodeFN(str_replace(':', '/', $namespace));
    }

    private function getPageNamespaceInfo(string $namespace): array
    {
        $namespaces = explode(':', $namespace);
        $pageID = array_pop($namespaces);
        $parentNamespace = implode(':', $namespaces);
        $parentID = '';
        if ($parentNamespace !== '') {
            $parts = explode(':', $parentNamespace);
            $parentID = (string)array_pop($parts);
        }
        return [
            'pageID' => $pageID,
            'parentNamespace' => $parentNamespace,
            'parentID' => $parentID,
        ];
    }

    private function isHomepage(string $pageID, string $parentID): bool
    {
        global $conf;
        $startPageID = (string)$conf['start'];
        return $pageID === $startPageID || ($parentID !== '' && $pageID === $parentID);
    }

    private function getCurrentNamespace(string $hostPageID): string
    {
        if (!is_dir($this->namespaceDir($hostPageID))) {
            $info = $this->getPageNamespaceInfo($hostPageID);
            if ($this->isHomepage((string)$info['pageID'], (string)$info['parentID'])) {
                return (string)$info['parentNamespace'];
            }
        }
        return $hostPageID;
    }

    private function resolveNamespaceExpression(string $expr, string $hostPageID): string
    {
        $expr = trim($expr);
        if ($expr === '.') return $this->getCurrentNamespace($hostPageID);
        if ($expr !== '' && $expr[0] === '~') {
            $rel = cleanID(ltrim($expr, '~'));
            $base = $this->getCurrentNamespace($hostPageID);
            return cleanID($base !== '' ? ($base . ':' . $rel) : $rel);
        }
        return cleanID($expr);
    }

    private function isTargetInNamespace(string $targetPage, string $namespace): bool
    {
        if ($namespace === '') return true;
        $targetPage = cleanID($targetPage);
        $namespace = cleanID($namespace);
        if ($targetPage === '' || $namespace === '') return false;
        return ($targetPage === $namespace) || (strpos($targetPage . ':', $namespace . ':') === 0);
    }

    private function pageUsesAffectedCatmenu(string $hostPageID, string $content, string $targetPage): bool
    {
        if (!preg_match_all('/\{\{catmenu>(.*?)\}\}/i', $content, $matches, PREG_SET_ORDER)) return false;
        foreach ($matches as $match) {
            $namespaceExpr = (string)($match[1] ?? '');
            $resolvedNS = $this->resolveNamespaceExpression($namespaceExpr, $hostPageID);
            if ($this->isTargetInNamespace($targetPage, $resolvedNS)) {
                return true;
            }
        }
        return false;
    }

    private function invalidateCacheForTarget(string $needle): void
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

            $path = $fileinfo->getPathname();
            $content = @file_get_contents($path);
            if ($content === false || strpos($content, $needle) === false) continue;

            $id = pathID($path);
            if ($id === '') continue;
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
        $this->invalidateCacheForTarget('{{catmenu>');
    }
}

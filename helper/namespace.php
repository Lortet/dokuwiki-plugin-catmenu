<?php
/**
 * Plugin catmenu — Helper partagé pour la résolution des namespaces
 *
 * Regroupe les utilitaires de navigation dans les namespaces DokuWiki
 * utilisés à la fois par le rendu syntaxique et l'intégration ProseMirror.
 *
 * Auteur: Lortetv
 */

use dokuwiki\Extension\Plugin;

class helper_plugin_catmenu_namespace extends Plugin
{
    /**
     * Retourne le chemin filesystem d'un namespace DokuWiki.
     */
    public function namespaceDir(string $namespace): string
    {
        global $conf;
        return rtrim((string)$conf['datadir'], '/') . '/' . utf8_encodeFN(str_replace(':', '/', $namespace));
    }

    /**
     * Décompose un namespace en ses composants (page, parent, etc.).
     *
     * @return array{pageID: string, parentNamespace: string, parentID: string}
     */
    public function getPageNamespaceInfo(string $namespace): array
    {
        $parts = explode(':', $namespace);
        $pageID = (string)array_pop($parts);
        $parentNamespace = implode(':', $parts);
        $parentID = '';
        if ($parentNamespace !== '') {
            $parentParts = explode(':', $parentNamespace);
            $parentID = (string)array_pop($parentParts);
        }
        return [
            'pageID'          => $pageID,
            'parentNamespace' => $parentNamespace,
            'parentID'        => $parentID,
        ];
    }

    /**
     * Indique si un identifiant de page correspond à une page d'accueil
     * (page de démarrage ou page homonyme du namespace parent).
     */
    public function isHomepage(string $pageID, string $parentID): bool
    {
        global $conf;
        $startPageID = (string)$conf['start'];
        return $pageID === $startPageID || ($parentID !== '' && $pageID === $parentID);
    }

    /**
     * Résout le namespace courant pour une page hôte donnée.
     * Remonte d'un niveau si la page hôte est elle-même une page d'accueil.
     */
    public function getCurrentNamespace(string $hostPageID): string
    {
        if (!is_dir($this->namespaceDir($hostPageID))) {
            $info = $this->getPageNamespaceInfo($hostPageID);
            if ($this->isHomepage($info['pageID'], $info['parentID'])) {
                return $info['parentNamespace'];
            }
        }
        return $hostPageID;
    }

    /**
     * Résout une expression de namespace (`.`, `~relatif`, ou absolu)
     * par rapport à la page hôte courante.
     */
    public function resolveNamespaceExpression(string $expr, string $hostPageID): string
    {
        $expr = trim($expr);
        if ($expr === '.') {
            return $this->getCurrentNamespace($hostPageID);
        }
        if ($expr !== '' && $expr[0] === '~') {
            $rel  = cleanID(ltrim($expr, '~'));
            $base = $this->getCurrentNamespace($hostPageID);
            return cleanID($base !== '' ? ($base . ':' . $rel) : $rel);
        }
        return cleanID($expr);
    }

    /**
     * Indique si une page cible appartient à un namespace donné.
     */
    public function isTargetInNamespace(string $targetPage, string $namespace): bool
    {
        if ($namespace === '') return true;
        $targetPage = cleanID($targetPage);
        $namespace  = cleanID($namespace);
        if ($targetPage === '' || $namespace === '') return false;
        return ($targetPage === $namespace) || (strpos($targetPage . ':', $namespace . ':') === 0);
    }
}

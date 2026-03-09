<?php

namespace dokuwiki\plugin\catmenu\parser;

use dokuwiki\plugin\prosemirror\parser\Node;

class CatmenuNode extends Node
{
    protected $data;
    protected $parent;

    public function __construct($data, Node $parent)
    {
        $this->data = $data;
        $this->parent = $parent;
    }

    public function toSyntax()
    {
        $attrs = $this->data['attrs'] ?? [];
        $syntax = trim((string)($attrs['syntax'] ?? ''));
        if ($syntax !== '') return $syntax;
        return '{{catmenu>.}}';
    }
}

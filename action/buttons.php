<?php

class action_plugin_catmenu_buttons extends DokuWiki_Action_Plugin
{
    public function register(Doku_Event_Handler $controller)
    {
        $controller->register_hook('TOOLBAR_DEFINE', 'AFTER', $this, 'handleToolbar');
    }

    public function handleToolbar(Doku_Event $event, $param)
    {
        if (!(bool)$this->getConf('show_in_editor_menu')) return;

        $event->data[] = [
            'type' => 'insert',
            'title' => 'CatMenu',
            'icon' => '../../plugins/catmenu/images/default.png',
            'insert' => '{{catmenu>.}}'
        ];
    }
}

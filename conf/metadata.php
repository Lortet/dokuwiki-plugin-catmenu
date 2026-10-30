<?php
$meta['skip_file']              = array('string', '_pattern' => '/^(@hidepages|$|\/.*\/.*$)/');
$meta['skip_page_without_title'] = array('onoff');
$meta['show_in_editor_menu']    = array('onoff');
$meta['context_menu_items']     = array('multicheckbox', '_choices' => array('newpage', 'reload', 'medias', 'pagesicon', 'url', 'search'));
$meta['footer_content']         = array('multiline');

<?php
/**
 * Plugin catmenu
 * Affiche les pages d’un namespace donné
 * Auteur: Lortetv
 */
 
use dokuwiki\Extension\SyntaxPlugin;
use dokuwiki\File\PageResolver;
use dokuwiki\Ui\Index;

class syntax_plugin_catmenu_catmenu extends SyntaxPlugin {
    /** @var helper_plugin_pagesicon|null|false */
    private $pagesiconHelper = false;

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
    public function connectTo($mode) { // reconnait la syntaxe utilisé par l'utilisateur
        $this->Lexer->addSpecialPattern('{{catmenu>.*?}}', $mode, 'plugin_catmenu_catmenu');
    }

    /**
     * Nettoie  {{catmenu>[namespace]}}
     */
    public function handle($match, $state, $pos, Doku_Handler $handler) {
        $namespace = trim(substr($match, 10, -2)); // retirer {{visualindex>, }} et les espaces
        return ['namespace' => $namespace];
    }

    public function render($mode, Doku_Renderer $renderer, $data) {
        if ($mode !== 'xhtml') return false;

		global $ID;
		global $conf;

		$random = uniqid();
		
		if($data['namespace'] === '.') { // Récupération du namespace courant
			if(!is_dir($this->namespaceDir($ID))) {
				$pageNamespaceInfo = $this->getPageNamespaceInfo($ID);
				if($this->isHomepage($pageNamespaceInfo['pageID'], $pageNamespaceInfo['parentID'])) {
					$namespace = $pageNamespaceInfo['parentNamespace'];
				}
			}
			
			if(!isset($namespace)) {
				$namespace = $ID;
			}
		}
		else {
			$namespace = cleanID($data['namespace']);
		}
		
		$pages = $this->getPagesAndSubfoldersItems($namespace);
		if($pages === false) {
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

				// In edit/preview pages, plugin scripts can load after inline rendering.
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
	 * Récupère à la fois les pages et les sous-dossiers d'un namespace
	 */
	public function getPagesAndSubfoldersItems($namespace) {
		global $conf;
		$skipPageWithoutTitle = (bool)$this->getConf('skip_page_without_title');

		$childrens = @scandir($this->namespaceDir($namespace)); // Récupère les elements
		if($childrens === false) {
			return false;
		}
		
		$start = $conf['start']; // 'accueil' dans la plupart des temps (dans bpnum:d-s:accueil)
		
		$items = [];
		foreach($childrens as $child) { // Boucle sur les elements
			if ($child[0] == '.' ) { // Remove ., .. and hidden files
				continue;
			}

			$childPathInfo = pathinfo($child);
			$childID = cleanID($childPathInfo['filename']);
			$childNamespace = cleanID($namespace !== '' ? ($namespace . ':' . $childID) : $childID);

			$childHasExtension = isset($childPathInfo['extension']) && $childPathInfo['extension'] !== '';
			$isDirNamespace = is_dir($this->namespaceDir($childNamespace));
			$isPageNamespace = page_exists($childNamespace);

			if(!$childHasExtension && $isDirNamespace) { // Si dossier
				$pageNamespaceInfo = $this->getPageNamespaceInfo($childNamespace);
				if($this->isHomepage($childID, (string)$pageNamespaceInfo['parentID'])) {
					// Flatten namespace "homepage" folders like ns:ns so children stay direct.
					$subItems = $this->getPagesAndSubfoldersItems($childNamespace);
					if(is_array($subItems) && $subItems) {
						$items = array_merge($items, $subItems);
					}
					continue;
				}

				$pageID = null;
				if(page_exists("$childNamespace:$start")) {	// S'il y a une page d'accueil
					$pageID = "$childNamespace:$start";
				}
				else if(page_exists("$childNamespace:$childID")) { // S'il y a une page du même nom que le dossier dans le dossier
					$pageID = "$childNamespace:$childID";
				}
				else if($isPageNamespace) { // S'il y a une page du même nom que le dossier au même niveau que le dossier
					$pageID = cleanID($namespace !== '' ? ($namespace . ':' . $childID) : $childID);
				}

				$permission = auth_quickaclcheck($pageID);
				if($permission < AUTH_READ) {
					continue;
				}
				
				$title = $pageID ? p_get_first_heading($pageID) : $pageID;
				if (empty($title)) {
					if ($skipPageWithoutTitle || empty($pageID)) {
						continue;
					}
					$title = noNS($pageID);
				}

				$items[] = array(
					'title' => $title,
					'url' => $pageID? wl($pageID) : null,
					'icon' => $this->getPageImage($pageID),
					'pagesiconUploadUrl' => $this->getPagesiconUploadUrl($pageID ?: $childNamespace),
					'folderNamespace' => $childNamespace,
					'namespace' => $childNamespace,
					'subtree' => $this->getPagesAndSubfoldersItems($childNamespace),
					'permission' => $permission
				);
				
				continue;
			}
			
			if(!$isDirNamespace && $isPageNamespace) { // Si page seulement
				$skipRegex = $this->getConf('skip_file');
				if (!empty($skipRegex) && preg_match($skipRegex, $childNamespace)) {
					continue;
				}

				$pageNamespaceInfo = $this->getPageNamespaceInfo("$namespace:$childID");
				if($this->isHomepage($childID, $pageNamespaceInfo['parentID'])) {
					continue;
				}

				$permission = auth_quickaclcheck($childNamespace);
				if($permission < AUTH_READ) {
					continue;
				}
				
				$title = p_get_first_heading($childNamespace);
				if (empty($title)) {
					if ($skipPageWithoutTitle) {
						continue;
					}
					$title = noNS($childNamespace);
				}
				
				$items[] = array(
					'title' => $title,
					'url' => $childNamespace? wl($childNamespace) : null,
					'icon' => $this->getPageImage($childNamespace),
					'pagesiconUploadUrl' => $this->getPagesiconUploadUrl($childNamespace),
					'folderNamespace' => $namespace,
					'namespace' => $childNamespace,
					'permission' => $permission
				);
			}
		}

		return $items;
	}

	/**
	 * Renvoie l'URL de la petite icone (thumbnail) via le helper pagesicon.
	 * Si aucune icone n'est definie, ne renvoie rien.
	 */
	public function getPageImage($page) {
		if(!$page) return '';

		$page = cleanID((string)$page);
		if($page === '') return '';

		/** @var helper_plugin_pagesicon|null $helper */
		$helper = plugin_load('helper', 'pagesicon');
		if(!$helper) return '';

		$namespace = getNS($page);
		$pageID = noNS($page);
		// Prefer new pagesicon API, keep legacy fallback for older versions.
		if(method_exists($helper, 'getPageIconUrl')) {
			$mtime = null;
			$iconUrl = $helper->getPageIconUrl($namespace, $pageID, 'smallorbig', ['width' => 55], $mtime, true);
			if($iconUrl) return $iconUrl;
		} else if(method_exists($helper, 'getImageIcon')) {
			$mtime = null;
			$withDefaultSupported = false;
			try {
				$method = new ReflectionMethod($helper, 'getImageIcon');
				$withDefaultSupported = $method->getNumberOfParameters() >= 6;
			} catch (ReflectionException $e) {
				$withDefaultSupported = false;
			}

			if($withDefaultSupported) {
				$iconUrl = $helper->getImageIcon($namespace, $pageID, 'smallorbig', ['width' => 55], $mtime, true);
			} else {
				$iconUrl = $helper->getImageIcon($namespace, $pageID, 'smallorbig', ['width' => 55], $mtime);
			}
			if($iconUrl) return $iconUrl;
		}

		$iconMediaID = false;
		if(method_exists($helper, 'getPageIconId')) {
			$iconMediaID = $helper->getPageIconId($namespace, $pageID, 'smallorbig');
		} else if(method_exists($helper, 'getPageImage')) {
			$withDefaultSupported = false;
			try {
				$method = new ReflectionMethod($helper, 'getPageImage');
				$withDefaultSupported = $method->getNumberOfParameters() >= 4;
			} catch (ReflectionException $e) {
				$withDefaultSupported = false;
			}

			if($withDefaultSupported) {
				$iconMediaID = $helper->getPageImage($namespace, $pageID, 'smallorbig', true);
			} else {
				$iconMediaID = $helper->getPageImage($namespace, $pageID, 'smallorbig');
			}
		}
		if(!$iconMediaID) return '';

		return ml($iconMediaID, ['width' => 55]);
	}

	private function getPagesiconUploadUrl($namespace) {
		if ($this->pagesiconHelper === false) {
			$this->pagesiconHelper = plugin_load('helper', 'pagesicon');
		}
		if (!$this->pagesiconHelper) return null;
		if (!method_exists($this->pagesiconHelper, 'getUploadIconPage')) return null;

		return $this->pagesiconHelper->getUploadIconPage((string)$namespace);
	}
	
	public function isHomepage($pageID, $parentID) {
		global $conf;
		$startPageID = $conf['start'];
		
		return $pageID == $startPageID || $pageID == $parentID;
	}
	
	public function namespaceDir($namespace) {
		global $conf;
		return $conf['datadir'] . '/' . utf8_encodeFN(str_replace(':', '/', $namespace));
	}
	
	public function getPageNamespaceInfo($namespace) {
		$namespaces = explode(':', $namespace);
		
		return array(
			'pageNamespace' => $namespace,
			'pageID' => array_pop($namespaces),
			'parentNamespace' => implode(':', $namespaces),
			'parentID' => array_pop($namespaces)
		);
	}
}

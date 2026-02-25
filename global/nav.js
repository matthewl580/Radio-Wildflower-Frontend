// Global navigation builder for Matthew Radio
// Injects a consistent top nav on every page. Excludes an Admin link.
(function(){
  const navItems = [
    { href: '/', icon: 'home', text: 'Home' },
    { href: '/play', icon: 'play_arrow', text: 'Play' },
    { href: '/join', icon: 'emoji_people', text: 'Join' },
    { href: '/donate', icon: 'volunteer_activism', text: 'Donate' }
  ];

  function createNav() {
    const header = document.createElement('header');
    header.setAttribute('role','banner');

    const nav = document.createElement('nav');
    nav.id = 'navBar';
    nav.setAttribute('aria-label','Main navigation');

    // logo / brand
    const logoBar = document.createElement('div');
    logoBar.id = 'logoBar';
    const logoContainer = document.createElement('div');
    logoContainer.id = 'logomarkContainer';
    const img = document.createElement('img');
    img.id = 'logomark';
    img.src = 'https://cdn.glitch.global/f81e375a-f3b2-430f-9115-3f352b74f21b/MIR%20Logo.png?v=1716468410227';
    img.alt = document.title || 'Matthew Radio';
    img.onerror = function() {
      this.onerror = null;
      this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="100%" height="100%" fill="%23ffffff"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="%23333">Matthew Radio</text></svg>';
    };
    img.loading = 'eager';
    logoContainer.appendChild(img);
    const brand = document.createElement('div');
    brand.id = 'brandWordMark';
    // allow per-page override via body dataset
    brand.textContent = document.body && document.body.dataset && document.body.dataset.brand ? document.body.dataset.brand : 'Matthew Radio';
    logoBar.appendChild(logoContainer);
    logoBar.appendChild(brand);

    // toggle
    const toggle = document.createElement('button');
    toggle.id = 'navToggle';
    toggle.className = 'nav-toggle btn-ripple';
    toggle.setAttribute('aria-label','Toggle navigation menu');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','navBarOptions');
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'material-symbols-rounded';
    toggleIcon.setAttribute('aria-hidden','true');
    toggleIcon.textContent = 'menu';
    toggle.appendChild(toggleIcon);

    // options
    const options = document.createElement('div');
    options.id = 'navBarOptions';
    options.setAttribute('role','menubar');

    const pathname = location.pathname.replace(/\\/g,'/') || '/';
    navItems.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.className = 'navBarOption nav-link';
      a.setAttribute('role','menuitem');
      const icon = document.createElement('span');
      icon.className = 'material-symbols-rounded';
      icon.setAttribute('aria-hidden','true');
      icon.textContent = item.icon;
      const text = document.createElement('span');
      text.className = 'optionText';
      text.textContent = item.text;
      a.appendChild(icon);
      a.appendChild(text);
      // mark current
      if ((item.href === '/' && (pathname === '/' || pathname === '/index.html')) || (item.href !== '/' && pathname.startsWith(item.href))) {
        a.setAttribute('aria-current','page');
      }
      options.appendChild(a);
    });

    nav.appendChild(logoBar);
    nav.appendChild(toggle);
    nav.appendChild(options);
    header.appendChild(nav);

    // insert as first element of body (before main content)
    const first = document.body.firstElementChild;
    if (first) document.body.insertBefore(header, first);
    else document.body.appendChild(header);

    // behavioral wiring
    function toggleMenu() {
      const isOpen = options.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
      if (window.accessibilityManager && typeof window.accessibilityManager.announce === 'function') {
        window.accessibilityManager.announce(isOpen ? 'Navigation menu opened' : 'Navigation menu closed','assertive');
      }
      if (isOpen) {
        const firstLink = options.querySelector('a');
        if (firstLink) firstLink.focus();
      }
    }

    toggle.addEventListener('click', toggleMenu);

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!options.classList.contains('open')) return;
      if (e.target.closest('#navBar')) return;
      options.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
    });

    // Close on Escape and keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && options.classList.contains('open')) {
        options.classList.remove('open');
        toggle.setAttribute('aria-expanded','false');
        toggle.focus();
      }
    });

    options.addEventListener('keydown', (e) => {
      const items = Array.from(options.querySelectorAll('a[role="menuitem"]'));
      const currentIndex = items.indexOf(document.activeElement);
      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          items[(currentIndex + 1) % items.length].focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          items[(currentIndex <= 0 ? items.length - 1 : currentIndex - 1)].focus();
          break;
        case 'Home':
          e.preventDefault();
          items[0].focus();
          break;
        case 'End':
          e.preventDefault();
          items[items.length - 1].focus();
          break;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createNav);
  } else {
    createNav();
  }

})();

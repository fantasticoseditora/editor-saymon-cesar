(() => {
  function applyRequestedCorrections() {
    const bianca = document.querySelector('img[src*="avatar-bianca"]')?.closest('.testimonial-person');
    if (bianca) {
      const name = bianca.querySelector('h3');
      const description = bianca.querySelector('p');
      if (name) name.textContent = 'Bianca Victória';
      if (description) description.innerHTML = 'Autora de <em>A Colisão das Luas</em> e designer';
    }

    const mauro = document.querySelector('img[src*="avatar-mauro"]')?.closest('.testimonial-person');
    if (mauro) {
      const name = mauro.querySelector('h3');
      const description = mauro.querySelector('p');
      if (name) name.textContent = 'Mauro Vick';
      if (description) description.innerHTML = 'Autor de <em>Justa Vingança</em>';
    }

    if (!document.getElementById('headline-spacing-fix')) {
      const style = document.createElement('style');
      style.id = 'headline-spacing-fix';
      style.textContent = `
        .hero h1 {
          line-height: .98;
        }

        @media (max-width: 700px) {
          .hero h1 {
            line-height: 1.04 !important;
            letter-spacing: -.025em;
          }

          .hero h1 em {
            margin-top: .08em;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  applyRequestedCorrections();

  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.main-nav');

  menuButton?.addEventListener('click', () => {
    const isOpen = menu?.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(Boolean(isOpen)));
  });

  menu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      menuButton?.setAttribute('aria-expanded', 'false');
    });
  });

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('visible'));
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const track = document.querySelector('.testimonial-track');
  const cards = [...document.querySelectorAll('.testimonial-card')];
  const previous = document.querySelector('.testimonial-prev');
  const next = document.querySelector('.testimonial-next');
  const pagination = document.querySelector('.testimonial-pagination');

  if (!track || !cards.length || !previous || !next || !pagination) return;

  let currentPage = 0;
  const visibleCards = () => window.matchMedia('(max-width:700px)').matches ? 1 : 2;
  const pageCount = () => Math.max(1, cards.length - visibleCards() + 1);
  const cardStep = () => cards[0].getBoundingClientRect().width + 18;

  function updateControls() {
    const total = pageCount();
    previous.disabled = currentPage <= 0;
    next.disabled = currentPage >= total - 1;
    pagination.querySelectorAll('.testimonial-dot').forEach((dot, index) => {
      dot.classList.toggle('active', index === currentPage);
    });
  }

  function goToPage(page) {
    currentPage = Math.max(0, Math.min(page, pageCount() - 1));
    track.scrollTo({ left: currentPage * cardStep(), behavior: 'smooth' });
    updateControls();
  }

  function drawDots() {
    pagination.innerHTML = Array.from({ length: pageCount() }, (_, index) =>
      `<button class="testimonial-dot${index === currentPage ? ' active' : ''}" type="button" aria-label="Ir para o depoimento ${index + 1}" data-page="${index}"></button>`
    ).join('');
    pagination.querySelectorAll('.testimonial-dot').forEach((dot) => {
      dot.addEventListener('click', () => goToPage(Number(dot.dataset.page)));
    });
    updateControls();
  }

  previous.addEventListener('click', () => goToPage(currentPage - 1));
  next.addEventListener('click', () => goToPage(currentPage + 1));

  let scrollTimer;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      currentPage = Math.max(0, Math.min(pageCount() - 1, Math.round(track.scrollLeft / cardStep())));
      updateControls();
    }, 90);
  }, { passive: true });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      currentPage = Math.min(currentPage, pageCount() - 1);
      drawDots();
      goToPage(currentPage);
    }, 120);
  });

  drawDots();
})();

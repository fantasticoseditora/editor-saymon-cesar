(() => {
  'use strict';

  const visualAdjustments = document.createElement('link');
  visualAdjustments.rel = 'stylesheet';
  visualAdjustments.href = 'adjustments.css?v=20260916-1';
  document.head.appendChild(visualAdjustments);

  document.documentElement.classList.add('js');

  /*
   * Configuração central da oferta.
   *
   * Checkout:
   * O repositório ainda não possui uma URL oficial associada à
   * "Operação Livro Pronto — R$ 375". Não reutilizar checkouts dos quatro
   * planos editoriais. Quando a URL oficial existir, preencher somente
   * checkoutUrl abaixo.
   *
   * Limites operacionais:
   * Não foram encontrados números oficiais para estes limites. Deixe vazio
   * até que sejam definidos. Ao preencher, o bloco de limites passa a ser
   * exibido automaticamente na seção "Condições da operação".
   */
  const OPERACAO_CONFIG = {
    checkoutUrl: '',
    limits: {
      maxWords: '',
      coverRounds: '',
      layoutRounds: ''
    }
  };

  const checkoutButtons = [...document.querySelectorAll('[data-checkout]')];
  const checkoutStatuses = [...document.querySelectorAll('[data-checkout-status]')];

  const showCheckoutPending = () => {
    checkoutStatuses.forEach((status) => {
      status.hidden = false;
      status.textContent = 'O checkout oficial da Operação Livro Pronto ainda não foi configurado nesta página. Nenhum link de outro produto foi reutilizado.';
    });

    const visibleStatus = checkoutStatuses.find((status) => {
      const rect = status.getBoundingClientRect();
      return rect.top >= 0 && rect.top <= window.innerHeight;
    });

    if (!visibleStatus) {
      document.getElementById('investimento')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => checkoutStatuses[1]?.focus?.(), 450);
    }
  };

  checkoutButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const url = OPERACAO_CONFIG.checkoutUrl.trim();
      if (!url) {
        showCheckoutPending();
        return;
      }

      // Usa o destino oficial centralizado e preserva o contexto da landing.
      window.location.assign(url);
    });
  });

  const limitLabels = {
    maxWords: 'Limite máximo de palavras ou extensão da obra',
    coverRounds: 'Rodadas de alterações na capa',
    layoutRounds: 'Rodadas de ajustes após a diagramação'
  };

  const definedLimits = Object.entries(OPERACAO_CONFIG.limits)
    .filter(([, value]) => String(value).trim());

  if (definedLimits.length) {
    const limitsBox = document.getElementById('operational-limits');
    const limitsList = document.getElementById('operational-limits-list');

    definedLimits.forEach(([key, value]) => {
      const item = document.createElement('li');
      item.textContent = `${limitLabels[key]}: ${value}`;
      limitsList?.appendChild(item);
    });

    if (limitsBox) limitsBox.hidden = false;
  }

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.07, rootMargin: '0px 0px 60px' });

    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('visible'));
  }

  const mobileCta = document.querySelector('[data-mobile-cta]');
  const hero = document.querySelector('.hero');
  const mobileQuery = window.matchMedia('(max-width: 700px)');

  const setMobileCta = (show) => {
    if (!mobileCta) return;
    const shouldShow = show && mobileQuery.matches;
    mobileCta.hidden = !shouldShow;
    document.body.classList.toggle('mobile-cta-visible', shouldShow);
  };

  if ('IntersectionObserver' in window && hero && mobileCta) {
    const heroObserver = new IntersectionObserver(([entry]) => {
      setMobileCta(!entry.isIntersecting);
    }, { threshold: 0.04 });
    heroObserver.observe(hero);
    mobileQuery.addEventListener?.('change', () => {
      if (!mobileQuery.matches) setMobileCta(false);
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

// Integração do formulário editorial com o Google Apps Script.
(() => {
  const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz5gOy4fxhf-_FEfZAo7OMms_fE6ZGs1OmGEdB5bPAWCZCZY29rvmqHeYL0cn2U29uR/exec';

  window.EDITORIAL_FORM_CONFIG = Object.freeze({
    appsScriptUrl,
    maxFileSizeMb: 10,
    acceptedExtensions: ['pdf', 'doc', 'docx', 'odt', 'rtf']
  });

  // Alguns navegadores móveis falham quando o POST para o Apps Script é
  // enviado com cabeçalhos personalizados ou redirecionamento manual.
  // Esta camada mantém o corpo JSON, remove cabeçalhos desnecessários e
  // deixa o navegador seguir o redirecionamento padrão do Google.
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const target = typeof input === 'string' ? input : String(input?.url || '');
    const isEditorialPost = target === appsScriptUrl
      && String(init.method || 'GET').toUpperCase() === 'POST';

    if (!isEditorialPost) return nativeFetch(input, init);

    return nativeFetch(input, {
      ...init,
      headers: undefined,
      mode: 'no-cors',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
  };
})();

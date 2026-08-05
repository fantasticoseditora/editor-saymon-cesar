(() => {
  const form = document.getElementById('editorial-form');
  if (!form) return;

  const config = window.EDITORIAL_FORM_CONFIG || {};
  const endpoint = String(config.appsScriptUrl || '').trim();
  const maxFileSizeMb = Number(config.maxFileSizeMb || 10);
  const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
  const acceptedExtensions = Array.isArray(config.acceptedExtensions)
    ? config.acceptedExtensions.map((item) => String(item).toLowerCase())
    : ['pdf','doc','docx','odt','rtf'];

  const startedAt = Date.now();
  const fileInput = document.getElementById('editorial-file');
  const fileText = document.getElementById('file-picker-text');
  const status = document.getElementById('submission-status');
  const submitButton = form.querySelector('button[type="submit"]');
  const serviceCheckboxes = [...form.querySelectorAll('input[name="servicos"]')];
  const noServices = document.getElementById('no-services');
  const servicesError = document.getElementById('services-error');

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  serviceCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox === noServices && checkbox.checked) {
        serviceCheckboxes.forEach((item) => { if (item !== noServices) item.checked = false; });
      } else if (checkbox !== noServices && checkbox.checked && noServices) {
        noServices.checked = false;
      }
      if (serviceCheckboxes.some((item) => item.checked)) servicesError?.classList.remove('visible');
    });
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (fileText) fileText.textContent = file ? `${file.name} — ${formatBytes(file.size)}` : 'Nenhum arquivo selecionado';
    setStatus('', '');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const services = serviceCheckboxes.filter((item) => item.checked).map((item) => item.value);
    if (!services.length) {
      servicesError?.classList.add('visible');
      document.getElementById('services-block')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const file = fileInput?.files?.[0];
    if (!file) {
      setStatus('Selecione o primeiro capítulo ou o original.', 'error');
      return;
    }

    const extension = getExtension(file.name);
    if (!acceptedExtensions.includes(extension)) {
      setStatus('Formato não permitido. Envie PDF, DOC, DOCX, ODT ou RTF.', 'error');
      return;
    }

    if (file.size > maxFileSizeBytes) {
      setStatus(`O documento ultrapassa o limite de ${maxFileSizeMb} MB.`, 'error');
      return;
    }

    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(endpoint)) {
      setStatus('O recebimento de arquivos está temporariamente indisponível. Tente novamente mais tarde.', 'error');
      return;
    }

    try {
      form.classList.add('is-submitting');
      submitButton.disabled = true;
      setStatus('Preparando o documento e enviando para o Google Drive… Não feche esta página.', 'loading');

      const data = new FormData(form);
      const base64 = await readFileAsDataUrl(file);
      const submissionId = window.crypto?.randomUUID?.() || `envio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = {
        submissionId,
        startedAt,
        website: data.get('website') || '',
        sourceUrl: window.location.href,
        nome: data.get('nome') || '',
        whatsapp: data.get('whatsapp') || '',
        email: data.get('email') || '',
        titulo: data.get('titulo') || '',
        tipo: data.get('tipo') || '',
        genero: data.get('genero') || '',
        estagio: data.get('estagio') || '',
        servicos,
        objetivoLiterario: data.get('objetivo_literario') || '',
        modeloPublicacao: data.get('modelo_publicacao') || '',
        observacoes: data.get('observacoes') || '',
        consentimento: Boolean(form.querySelector('.consent input[type="checkbox"]')?.checked),
        file: {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          base64
        }
      };

      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      });

      setStatus('Envio concluído. Seu documento foi encaminhado para a avaliação editorial. Entrarei em contato pelos dados informados.', 'success');
      form.reset();
      if (fileText) fileText.textContent = 'Nenhum arquivo selecionado';
      status?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      console.error(error);
      setStatus('Não foi possível concluir o envio. Verifique sua conexão e tente novamente.', 'error');
    } finally {
      form.classList.remove('is-submitting');
      submitButton.disabled = false;
    }
  });

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message;
    status.className = `submission-status${message ? ' visible' : ''}${type ? ` ${type}` : ''}`;
  }

  function getExtension(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1,Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.',',')} MB`;
  }
})();

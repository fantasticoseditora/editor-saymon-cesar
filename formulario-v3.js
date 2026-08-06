(() => {
  const form = document.getElementById('editorial-form');
  if (!form) return;

  const config = window.EDITORIAL_FORM_CONFIG || {};
  const endpoint = String(config.appsScriptUrl || '').trim();
  const maxFileSizeMb = Number(config.maxFileSizeMb || 10);
  const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
  const acceptedExtensions = Array.isArray(config.acceptedExtensions)
    ? config.acceptedExtensions.map((item) => String(item).toLowerCase())
    : ['pdf', 'doc', 'docx', 'odt', 'rtf'];

  const CHUNK_SIZE = 180 * 1024;
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
        serviceCheckboxes.forEach((item) => {
          if (item !== noServices) item.checked = false;
        });
      } else if (checkbox !== noServices && checkbox.checked && noServices) {
        noServices.checked = false;
      }

      if (serviceCheckboxes.some((item) => item.checked)) {
        servicesError?.classList.remove('visible');
      }
    });
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (fileText) {
      fileText.textContent = file
        ? `${file.name} — ${formatBytes(file.size)}`
        : 'Nenhum arquivo selecionado';
    }
    setStatus('', '');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const services = serviceCheckboxes
      .filter((item) => item.checked)
      .map((item) => item.value);

    if (!services.length) {
      servicesError?.classList.add('visible');
      document.getElementById('services-block')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
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
      setStatus('O recebimento de arquivos está temporariamente indisponível.', 'error');
      return;
    }

    try {
      form.classList.add('is-submitting');
      submitButton.disabled = true;
      setStatus('Preparando o documento…', 'loading');

      const data = new FormData(form);
      const base64 = stripDataUrlPrefix(await readFileAsDataUrl(file));
      const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
      const submissionId = window.crypto?.randomUUID?.()
        || `envio-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const metadata = {
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
        servicos: services,
        objetivoLiterario: data.get('objetivo_literario') || '',
        modeloPublicacao: data.get('modelo_publicacao') || '',
        observacoes: data.get('observacoes') || '',
        consentimento: Boolean(
          form.querySelector('.consent input[type="checkbox"]')?.checked
        ),
        file: {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          totalChunks
        }
      };

      setStatus('Iniciando o envio seguro para o Google Drive…', 'loading');
      await postAndConfirm({
        action: 'init',
        submissionId,
        payload: JSON.stringify(metadata)
      }, `init:${submissionId}`);

      for (let index = 0; index < totalChunks; index++) {
        const chunk = base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        const percent = Math.round(((index + 1) / totalChunks) * 88);
        setStatus(
          `Enviando o documento: parte ${index + 1} de ${totalChunks} (${percent}%)…`,
          'loading'
        );

        await postAndConfirm({
          action: 'chunk',
          submissionId,
          index: String(index),
          data: chunk
        }, `chunk:${submissionId}:${index}`);
      }

      setStatus('Montando o arquivo e registrando os dados na planilha…', 'loading');
      const result = await postAndConfirm({
        action: 'finalize',
        submissionId
      }, `submission:${submissionId}`, 120000);

      if (!result || result.status !== 'saved') {
        throw new Error(result?.message || 'O Google não confirmou o salvamento.');
      }

      setStatus(
        'Envio concluído. Seu documento foi salvo no Google Drive e registrado para avaliação editorial.',
        'success'
      );
      form.reset();
      if (fileText) fileText.textContent = 'Nenhum arquivo selecionado';
      status?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      console.error(error);
      setStatus(
        error?.message
          ? `Não foi possível concluir o envio: ${error.message}`
          : 'Não foi possível concluir o envio. Tente novamente.',
        'error'
      );
    } finally {
      form.classList.remove('is-submitting');
      submitButton.disabled = false;
    }
  });

  async function postAndConfirm(fields, ackKey, timeoutMs = 60000) {
    const uniqueAck = `editorial:ack:${ackKey}`;
    submitHiddenForm({
      ...fields,
      ackKey: uniqueAck
    });

    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const result = await jsonpCheck(uniqueAck).catch(() => null);

      if (result?.status === 'error') {
        throw new Error(result.message || 'O Google recusou esta etapa do envio.');
      }

      if (
        result?.status === 'initialized'
        || result?.status === 'chunk-saved'
        || result?.status === 'saved'
      ) {
        return result;
      }

      await delay(1200);
    }

    throw new Error('O Google não confirmou uma das etapas dentro do tempo esperado.');
  }

  function submitHiddenForm(fields) {
    const frameName = `editorial-frame-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const iframe = document.createElement('iframe');
    const transport = document.createElement('form');

    iframe.name = frameName;
    iframe.hidden = true;
    iframe.setAttribute('aria-hidden', 'true');

    transport.method = 'POST';
    transport.action = endpoint;
    transport.target = frameName;
    transport.acceptCharset = 'UTF-8';
    transport.enctype = 'application/x-www-form-urlencoded';
    transport.style.display = 'none';

    Object.entries(fields).forEach(([name, value]) => {
      const field = document.createElement('textarea');
      field.name = name;
      field.value = String(value ?? '');
      transport.appendChild(field);
    });

    document.body.appendChild(iframe);
    document.body.appendChild(transport);
    transport.submit();

    window.setTimeout(() => {
      transport.remove();
      iframe.remove();
    }, 180000);
  }

  function jsonpCheck(checkKey) {
    return new Promise((resolve, reject) => {
      const callbackName = `__editorialCheck_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => finish(null, new Error('Falha na confirmação.')), 12000);

      const finish = (value, error) => {
        window.clearTimeout(timeout);
        script.remove();
        try {
          delete window[callbackName];
        } catch (_) {
          window[callbackName] = undefined;
        }
        if (error) reject(error);
        else resolve(value);
      };

      window[callbackName] = (value) => finish(value, null);
      script.onerror = () => finish(null, new Error('Falha ao consultar o Apps Script.'));
      script.src = `${endpoint}?check=${encodeURIComponent(checkKey)}&callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

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

  function stripDataUrlPrefix(value) {
    const comma = String(value || '').indexOf(',');
    return comma >= 0 ? String(value).slice(comma + 1) : String(value || '');
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();

const CONFIG = Object.freeze({
  NEW_SUBMISSIONS_FOLDER_ID: '130qQx55runnM5ONaDaX0GAYI8VrvHrX6',
  SPREADSHEET_ID: '1RZkl7Azi0haQlqXEUHc6IccUjP7SkgLtTZUxsUl_83Y',
  SHEET_NAME: 'Envios',
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_EXTENSIONS: ['pdf', 'doc', 'docx', 'odt', 'rtf'],
  TIME_ZONE: 'America/Sao_Paulo',
  STATE_PREFIX: 'editorial:state:',
  ACK_PREFIX: 'editorial:ack:'
});

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = sanitizeCallback_(params.callback || '');

  let result;

  if (params.check) {
    const raw = CacheService.getScriptCache().get(String(params.check));
    result = raw ? JSON.parse(raw) : { ok: true, status: 'pending' };
  } else {
    result = {
      ok: true,
      service: 'Formulário editorial — Saymon César',
      status: 'online',
      protocol: 'chunked-v1'
    };
  }

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return jsonResponse_(result);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '');
  const submissionId = sanitizeId_(params.submissionId || '');
  const ackKey = String(params.ackKey || '');

  try {
    if (!lock.tryLock(30000)) {
      throw new Error('O sistema está processando outro envio. Tente novamente em alguns segundos.');
    }

    if (!action) {
      throw new Error('Ação ausente.');
    }

    if (action === 'init') {
      const payload = parseJson_(params.payload, 'Dados iniciais inválidos.');
      const result = initializeSubmission_(payload);
      acknowledge_(ackKey, result);
      return jsonResponse_(result);
    }

    if (!submissionId) {
      throw new Error('Identificador do envio ausente.');
    }

    if (action === 'chunk') {
      const index = Number(params.index);
      const data = String(params.data || '');
      const result = saveChunk_(submissionId, index, data);
      acknowledge_(ackKey, result);
      return jsonResponse_(result);
    }

    if (action === 'finalize') {
      const result = finalizeSubmission_(submissionId);
      acknowledge_(ackKey, result);
      acknowledge_('submission:' + submissionId, result);
      return jsonResponse_(result);
    }

    throw new Error('Ação desconhecida.');
  } catch (error) {
    const result = {
      ok: false,
      status: 'error',
      message: error && error.message ? error.message : String(error)
    };

    acknowledge_(ackKey, result);

    if (submissionId) {
      acknowledge_('submission:' + submissionId, result);
    }

    return jsonResponse_(result);
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function initializeSubmission_(payload) {
  validateInitialPayload_(payload);

  const submissionId = sanitizeId_(payload.submissionId);
  const shortId = submissionId.slice(0, 8);
  const now = new Date();
  const datePrefix = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const authorName = sanitizeName_(payload.nome || 'Autor');
  const bookTitle = sanitizeName_(payload.titulo || 'Obra sem título');
  const folderName = datePrefix + ' — ' + authorName + ' — ' + bookTitle + ' — ' + shortId;

  const parentFolder = DriveApp.getFolderById(CONFIG.NEW_SUBMISSIONS_FOLDER_ID);
  const folder = parentFolder.createFolder(folderName);

  const state = {
    submissionId: submissionId,
    folderId: folder.getId(),
    folderName: folderName,
    createdAt: now.toISOString(),
    recebidoEm: Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'),
    nome: String(payload.nome || ''),
    whatsapp: String(payload.whatsapp || ''),
    email: String(payload.email || ''),
    titulo: String(payload.titulo || ''),
    tipo: String(payload.tipo || ''),
    genero: String(payload.genero || ''),
    estagio: String(payload.estagio || ''),
    servicos: Array.isArray(payload.servicos) ? payload.servicos.map(String) : [],
    objetivoLiterario: String(payload.objetivoLiterario || ''),
    modeloPublicacao: String(payload.modeloPublicacao || ''),
    observacoes: String(payload.observacoes || ''),
    consentimento: Boolean(payload.consentimento),
    sourceUrl: String(payload.sourceUrl || ''),
    file: {
      name: sanitizeFileName_(payload.file.name),
      originalName: String(payload.file.name || ''),
      mimeType: String(payload.file.mimeType || 'application/octet-stream'),
      size: Number(payload.file.size || 0),
      totalChunks: Number(payload.file.totalChunks || 0)
    }
  };

  PropertiesService
    .getScriptProperties()
    .setProperty(CONFIG.STATE_PREFIX + submissionId, JSON.stringify(state));

  folder.createFile(
    '__envio.json',
    JSON.stringify(state, null, 2),
    MimeType.PLAIN_TEXT
  );

  return {
    ok: true,
    status: 'initialized',
    submissionId: submissionId,
    totalChunks: state.file.totalChunks
  };
}

function saveChunk_(submissionId, index, data) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Índice de bloco inválido.');
  }

  if (!data) {
    throw new Error('Bloco vazio.');
  }

  const state = getState_(submissionId);

  if (index >= state.file.totalChunks) {
    throw new Error('Índice de bloco fora do intervalo.');
  }

  const folder = DriveApp.getFolderById(state.folderId);
  const chunkName = chunkFileName_(index);
  trashFilesByName_(folder, chunkName);
  folder.createFile(chunkName, data, MimeType.PLAIN_TEXT);

  return {
    ok: true,
    status: 'chunk-saved',
    submissionId: submissionId,
    index: index
  };
}

function finalizeSubmission_(submissionId) {
  const state = getState_(submissionId);
  const folder = DriveApp.getFolderById(state.folderId);
  const chunks = [];

  for (let index = 0; index < state.file.totalChunks; index++) {
    const chunkName = chunkFileName_(index);
    const files = folder.getFilesByName(chunkName);

    if (!files.hasNext()) {
      throw new Error('O bloco ' + (index + 1) + ' de ' + state.file.totalChunks + ' não foi recebido.');
    }

    chunks.push(files.next().getBlob().getDataAsString('UTF-8'));
  }

  const base64 = chunks.join('');
  const fileBytes = Utilities.base64Decode(base64);

  if (fileBytes.length > CONFIG.MAX_FILE_SIZE_BYTES) {
    throw new Error('O arquivo ultrapassa o limite de 10 MB.');
  }

  trashFilesByName_(folder, state.file.name);

  const blob = Utilities.newBlob(
    fileBytes,
    state.file.mimeType || 'application/octet-stream',
    state.file.name
  );
  const file = folder.createFile(blob);

  for (let index = 0; index < state.file.totalChunks; index++) {
    trashFilesByName_(folder, chunkFileName_(index));
  }

  const metadataFiles = folder.getFilesByName('__envio.json');
  while (metadataFiles.hasNext()) {
    metadataFiles.next().setTrashed(true);
  }

  appendToSpreadsheet_({
    recebidoEm: state.recebidoEm,
    nome: state.nome,
    email: state.email,
    whatsapp: state.whatsapp,
    titulo: state.titulo,
    tipo: state.tipo,
    genero: state.genero,
    estagio: state.estagio,
    objetivoLiterario: state.objetivoLiterario,
    modeloPublicacao: state.modeloPublicacao,
    servicos: state.servicos,
    observacoes: state.observacoes,
    consentimento: state.consentimento,
    id: state.submissionId,
    arquivo: {
      nome: file.getName(),
      link: file.getUrl()
    },
    pasta: {
      nome: state.folderName,
      link: folder.getUrl()
    }
  });

  PropertiesService
    .getScriptProperties()
    .deleteProperty(CONFIG.STATE_PREFIX + submissionId);

  return {
    ok: true,
    status: 'saved',
    submissionId: submissionId,
    fileUrl: file.getUrl(),
    folderUrl: folder.getUrl()
  };
}

function getState_(submissionId) {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(CONFIG.STATE_PREFIX + submissionId);

  if (!raw) {
    throw new Error('Estado do envio não encontrado ou expirado.');
  }

  return JSON.parse(raw);
}

function appendToSpreadsheet_(metadata) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  ensureHeaders_(sheet);

  sheet.appendRow([
    metadata.recebidoEm,
    'Novo envio',
    metadata.nome,
    metadata.email,
    metadata.whatsapp,
    metadata.titulo,
    metadata.tipo,
    metadata.genero,
    metadata.estagio,
    metadata.objetivoLiterario,
    metadata.modeloPublicacao,
    metadata.servicos.join(' | '),
    metadata.arquivo.link,
    metadata.pasta.link,
    metadata.id,
    metadata.consentimento ? 'Sim' : 'Não',
    '',
    '',
    '',
    metadata.observacoes
  ]);
}

function ensureHeaders_(sheet) {
  const headers = [[
    'Data do envio',
    'Status',
    'Nome',
    'E-mail',
    'WhatsApp',
    'Título da obra',
    'Tipo',
    'Gênero ou área',
    'Estágio da obra',
    'Objetivo literário',
    'Modelo de publicação',
    'Serviços já realizados',
    'Link do arquivo',
    'Pasta do autor',
    'ID do envio',
    'Consentimento',
    'Início da análise',
    'Relatório enviado',
    'Retorno comercial',
    'Observações'
  ]];

  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  sheet.setFrozenRows(1);
}

function validateInitialPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dados do formulário ausentes.');
  }

  const submissionId = sanitizeId_(payload.submissionId || '');
  if (!submissionId) {
    throw new Error('Identificador do envio inválido.');
  }

  if (!payload.nome || !payload.email || !payload.whatsapp || !payload.titulo) {
    throw new Error('Preencha nome, e-mail, WhatsApp e título da obra.');
  }

  if (!payload.file || !payload.file.name) {
    throw new Error('Arquivo ausente.');
  }

  const extension = getExtension_(payload.file.name);
  if (CONFIG.ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
    throw new Error('Formato de arquivo não permitido.');
  }

  const size = Number(payload.file.size || 0);
  if (!size || size > CONFIG.MAX_FILE_SIZE_BYTES) {
    throw new Error('O arquivo ultrapassa o limite de 10 MB.');
  }

  const totalChunks = Number(payload.file.totalChunks || 0);
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 200) {
    throw new Error('Quantidade de blocos inválida.');
  }
}

function acknowledge_(key, result) {
  if (!key) return;
  CacheService
    .getScriptCache()
    .put(String(key), JSON.stringify(result), 600);
}

function parseJson_(value, message) {
  try {
    return JSON.parse(String(value || '{}'));
  } catch (_) {
    throw new Error(message || 'JSON inválido.');
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeCallback_(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_.$]/g, '');
}

function sanitizeId_(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 100);
}

function sanitizeName_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Sem nome';
}

function sanitizeFileName_(value) {
  const cleaned = String(value || 'arquivo')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 160) || 'arquivo';
}

function getExtension_(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function chunkFileName_(index) {
  return '__chunk_' + String(index).padStart(4, '0') + '.txt';
}

function trashFilesByName_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

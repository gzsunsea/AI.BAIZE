const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_IMAGE = 5 * 1024 * 1024;
const PRIVATE_NAME = /^[a-f0-9]{32}\.png$/;

/** Mount after site authentication; never mount imageDir with express.static. */
function createFeedbackRouter({readState, writeState, imageDir = path.resolve(process.cwd(), 'data/feedback-images'), requireAdmin, maxAttempts = 10, windowMs = 15 * 60 * 1000} = {}) {
  if (typeof readState !== 'function' || typeof writeState !== 'function') throw new TypeError('Feedback needs readState and writeState');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || !Number.isFinite(windowMs) || windowMs <= 0) throw new TypeError('Invalid feedback rate limit');
  const router = express.Router();
  const attempts = new Map();
  let active = 0;
  const directory = path.resolve(imageDir);
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_IMAGE, files: 1, fields: 3, parts: 4, fieldSize: 8000, fieldNameSize: 32}}).single('screenshot');
  const fail = (res, status, detail) => res.status(status).json({detail});

  router.post('/api/site/feedback', (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    const now = Date.now();
    for (const [key, record] of attempts) if (record.until <= now) attempts.delete(key);
    // req.ip follows the application's explicitly configured proxy trust, never a raw header.
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let record = attempts.get(key);
    if (!record) {
      if (attempts.size >= 4096) return fail(res, 429, '请求过多，请稍后重试。');
      record = {count: 0, until: now + windowMs}; attempts.set(key, record);
    }
    if (record.count++ >= maxAttempts) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((record.until - now) / 1000))));
      return fail(res, 429, '提交过于频繁，请稍后重试。');
    }
    if (!req.is('multipart/form-data')) return fail(res, 400, '需要使用表单提交反馈。');
    if (active >= 4) return fail(res, 503, '服务繁忙，请稍后重试。');
    active++;
    let released = false;
    const release = () => {if (!released) {released = true; active--;}};
    res.once('finish', release); res.once('close', release);
    upload(req, res, error => {
      if (error) return fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? '截图原图不超过 5 MB。' : '反馈表单格式或大小不符合要求。');
      next();
    });
  }, async (req, res) => {
    const body = req.body || {};
    const limits = {content: 2000, email: 200, pageUrl: 2000};
    for (const key of Object.keys(body)) if (!Object.hasOwn(limits, key)) return fail(res, 400, '反馈包含不支持的字段。');
    for (const [key, limit] of Object.entries(limits)) if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > limit)) return fail(res, 400, '反馈字段格式或长度不符合要求。');
    const content = (body.content || '').trim();
    if (content.length < 2) return fail(res, 400, '请写下反馈内容。');
    let fileName;
    try {
      let png;
      if (req.file) {
        try {
          const image = sharp(req.file.buffer, {limitInputPixels: 16_000_000, failOn: 'warning'});
          const metadata = await image.metadata();
          if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) return fail(res, 400, '截图需要是有效的 PNG、JPEG 或 WebP 静态图片。');
          // Decode and reencode strips metadata and ignores user-controlled filenames and MIME.
          png = await image.rotate().png().toBuffer();
          if (png.length > 20 * 1024 * 1024) return fail(res, 413, '截图解码后过大。');
        } catch { return fail(res, 400, '截图无法读取，请换一张图片。'); }
      }
      if (req.aborted || res.destroyed) return;
      if (png) {
        await fs.mkdir(directory, {recursive: true, mode: 0o700});
        await fs.chmod(directory, 0o700);
        fileName = `${crypto.randomBytes(16).toString('hex')}.png`;
        await fs.writeFile(path.join(directory, fileName), png, {flag: 'wx', mode: 0o600});
      }
      const state = readState();
      const row = {id: crypto.randomUUID(), message: content, contact: (body.email || '').trim(), page: (body.pageUrl || '').trim(), kind: 'general', itemId: '', context: '', status: 'open', createdAt: new Date().toISOString(), ...(fileName ? {screenshot: 'local', screenshotFile: fileName} : {})};
      const previous = state.feedback || [];
      state.feedback = [row, ...previous].slice(0, 300);
      await writeState(state);
      // Delete files no longer referenced by the bounded feedback collection after durable save.
      const retained = new Set(state.feedback.map(item => item.screenshotFile));
      for (const old of previous) if (PRIVATE_NAME.test(old.screenshotFile || '') && !retained.has(old.screenshotFile)) await fs.unlink(path.join(directory, old.screenshotFile)).catch(() => {});
      return res.json({id: row.id});
    } catch {
      if (fileName) await fs.unlink(path.join(directory, fileName)).catch(() => {});
      return fail(res, 503, '反馈暂时无法保存，请稍后重试。');
    }
  });

  const authenticate = requireAdmin || ((req, res, next) => req.siteAdmin === true ? next() : fail(res, 401, '需要管理员登录。'));
  router.get('/api/admin/feedback/:id/screenshot', (req, res, next) => {res.set({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}); next();}, authenticate, async (req, res) => {
    try {
      const row = (readState().feedback || []).find(item => String(item.id) === req.params.id);
      if (!row || row.screenshot !== 'local' || !PRIVATE_NAME.test(row.screenshotFile || '')) return fail(res, 404, '截图不存在。');
      const bytes = await fs.readFile(path.join(directory, row.screenshotFile));
      res.type('png').set('Content-Disposition', 'inline; filename="feedback.png"').send(bytes);
    } catch { return fail(res, 404, '截图不存在。'); }
  });
  return router;
}
module.exports = {createFeedbackRouter};

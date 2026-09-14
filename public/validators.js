/* =====================================================
   VALIDATORS — StockPro
===================================================== */

const Validators = (function () {
  const TEXT_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9' &/.,()#-]{2,150}$/;
  const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,80}$/;
  const PHONE_RE = /^[0-9]{8,15}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const HAS_LETTER_OR_DIGIT = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]/;

  function isNonEmptyText(v, { min = 2, max = 150 } = {}) {
    const s = (v || '').toString().trim();
    if (s.length < min || s.length > max) return false;
    return HAS_LETTER_OR_DIGIT.test(s);
  }
  function isValidName(v) { return NAME_RE.test((v || '').trim()); }
  function isValidPhone(v) { return !v || PHONE_RE.test((v || '').replace(/\D/g, '')); }
  function isValidEmail(v) { return !v || EMAIL_RE.test((v || '').trim()); }
  function isPositiveNumber(v) {
    if (v === '' || v === null || v === undefined) return false;
    const n = Number(v);
    return !Number.isNaN(n) && n >= 0;
  }
  function isPositiveInt(v) {
    if (v === '' || v === null || v === undefined) return false;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0;
  }

  function markInvalid(input, message) {
    if (!input) return;
    const field = input.closest('.field') || input;
    field.classList.add('has-error');
    let msgEl = field.querySelector('.field-error');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'field-error';
      field.appendChild(msgEl);
    }
    msgEl.textContent = message;
  }
  function clearInvalid(input) {
    if (!input) return;
    const field = input.closest('.field') || input;
    field.classList.remove('has-error');
    const msgEl = field.querySelector('.field-error');
    if (msgEl) msgEl.remove();
  }
  function clearAll(inputs) { inputs.forEach(clearInvalid); }

  return {
    isNonEmptyText, isValidName, isValidPhone, isValidEmail,
    isPositiveNumber, isPositiveInt,
    markInvalid, clearInvalid, clearAll
  };
})();

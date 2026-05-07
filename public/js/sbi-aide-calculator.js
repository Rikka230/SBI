const SBI_AID_CALCULATOR_VERSION = '8.0P.10d';
const SBI_RNCP_LEVEL = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function addYearsMinusOneDay(date, years = 1) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  next.setDate(next.getDate() - 1);
  return next;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function daysBetween(startDate, endDate) {
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end - start) / ONE_DAY_MS);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function formatEuro(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Math.max(0, Number(value) || 0));
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)} %`;
}

function getState(root) {
  const activeValue = (field) => root.querySelector(`.aid-calc-segment.is-active[data-field="${field}"]`)?.dataset.value;
  const fieldValue = (field) => root.querySelector(`[data-aid-field="${field}"]`)?.value || '';

  return {
    companySize: activeValue('companySize') || 'under_250',
    contractType: activeValue('contractType') || 'apprentissage',
    isDisabledApprentice: activeValue('isDisabledApprentice') === 'yes',
    signatureDate: fieldValue('signatureDate'),
    contractStartDate: fieldValue('contractStartDate'),
    contractEndDate: fieldValue('contractEndDate'),
    nonExecutedDays: Math.max(0, Number.parseInt(fieldValue('nonExecutedDays') || '0', 10) || 0)
  };
}

function calculateAid(state) {
  let baseAid = 0;
  let status = 'a_verifier';
  let reason = '';
  let summary = '';

  if (state.contractType !== 'apprentissage') {
    status = 'hors_simulateur';
    reason = "Ce simulateur concerne les contrats d'apprentissage. Pour un contrat de professionnalisation, les règles peuvent différer.";
  } else if (state.isDisabledApprentice) {
    baseAid = 6000;
    status = 'eligible';
  } else if (state.companySize === 'under_250') {
    baseAid = 5000;
    status = 'eligible';
  } else {
    status = 'a_verifier';
    reason = 'Les règles peuvent différer pour les entreprises de 250 salariés et plus. Un accompagnement est recommandé.';
  }

  const startDate = parseLocalDate(state.contractStartDate);
  const endDate = parseLocalDate(state.contractEndDate);
  let ratio = baseAid > 0 ? 1 : 0;
  let dateWarning = '';

  if (startDate && endDate) {
    if (endDate < startDate) {
      ratio = 0;
      dateWarning = 'La date de fin prévue doit être postérieure au début du contrat.';
    } else {
      const firstYearEnd = new Date(Math.min(endDate.getTime(), addYearsMinusOneDay(startDate).getTime()));
      const theoreticalDays = Math.max(0, daysBetween(startDate, firstYearEnd) + 1);
      const executedDays = Math.max(0, theoreticalDays - state.nonExecutedDays);
      const referenceDays = isLeapYear(startDate.getFullYear()) ? 366 : 365;
      ratio = baseAid > 0 ? Math.min(1, executedDays / referenceDays) : 0;
    }
  }

  const estimatedAid = Math.round(baseAid * ratio);

  if (status === 'eligible') {
    const companyText = state.companySize === 'under_250'
      ? 'une entreprise de moins de 250 salariés'
      : 'une entreprise recrutant un apprenti';
    const disabilityText = state.isDisabledApprentice ? ' en situation de handicap' : '';
    summary = `Estimation pour ${companyText} recrutant un apprenti${disabilityText} en formation SBI Bac / Niveau ${SBI_RNCP_LEVEL}.`;
  } else {
    summary = reason;
  }

  return {
    baseAid,
    estimatedAid,
    ratio,
    status,
    reason,
    summary,
    dateWarning
  };
}

function statusLabel(status) {
  if (status === 'eligible') return 'Éligible';
  if (status === 'hors_simulateur') return 'Hors simulateur';
  return 'À vérifier';
}

function updateSegment(button) {
  const group = button.closest('.aid-calc-segmented');
  if (!group) return;

  group.querySelectorAll('.aid-calc-segment[data-field]').forEach((segment) => {
    const active = segment === button;
    segment.classList.toggle('is-active', active);
    segment.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setText(root, selector, text) {
  const target = root.querySelector(selector);
  if (target) target.textContent = text;
}

function updateResult(root) {
  const state = getState(root);
  const result = calculateAid(state);
  const isEligible = result.status === 'eligible';

  setText(root, '[data-aid-result-amount]', isEligible ? formatEuro(result.estimatedAid) : 'À vérifier');
  setText(root, '[data-aid-result-summary]', result.summary);
  setText(root, '[data-aid-base]', formatEuro(result.baseAid));
  setText(root, '[data-aid-ratio]', formatPercent(result.ratio));
  setText(root, '[data-aid-status]', statusLabel(result.status));
  setText(root, '[data-aid-error]', result.dateWarning || result.reason || '');

  const statusNode = root.querySelector('[data-aid-status]');
  if (statusNode) {
    statusNode.classList.toggle('is-eligible', isEligible);
    statusNode.classList.toggle('is-warning', !isEligible);
  }

  const contactLink = root.querySelector('[data-aid-contact-link]');
  if (contactLink) {
    const subject = encodeURIComponent('Estimation aide à l\'embauche SBI');
    const body = encodeURIComponent([
      'Bonjour SBI,',
      '',
      'Je souhaite recevoir mon estimation pour l\'aide à l\'embauche.',
      `Montant estimé : ${formatEuro(result.estimatedAid)}`,
      `Statut : ${statusLabel(result.status)}`,
      `Formation : Bac / RNCP Niveau ${SBI_RNCP_LEVEL}`,
      '',
      'Merci.'
    ].join('\n'));
    contactLink.href = `mailto:contact@sbi.fr?subject=${subject}&body=${body}`;
    const contactParams = new URLSearchParams({
      motif: 'estimation-aide',
      montant: formatEuro(result.estimatedAid),
      statut: statusLabel(result.status),
      formation: `Bac / RNCP Niveau ${SBI_RNCP_LEVEL}`
    });
    contactLink.href = `contact.html?${contactParams.toString()}`;
  }

  root.dispatchEvent(new CustomEvent('sbi:aid-calculator:updated', {
    bubbles: true,
    detail: { version: SBI_AID_CALCULATOR_VERSION, state, result }
  }));

  return result;
}

function applyDefaultDates(root) {
  const signatureInput = root.querySelector('[data-aid-field="signatureDate"]');
  const startInput = root.querySelector('[data-aid-field="contractStartDate"]');
  const endInput = root.querySelector('[data-aid-field="contractEndDate"]');
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = addYearsMinusOneDay(start);

  if (signatureInput && !signatureInput.value) signatureInput.value = toDateInputValue(today);
  if (startInput && !startInput.value) startInput.value = toDateInputValue(start);
  if (endInput && !endInput.value) endInput.value = toDateInputValue(end);
}

export function initSbiAidCalculator(scope = document) {
  const roots = Array.from(scope.querySelectorAll?.('.sbi-aide-calculator') || []);
  if (!roots.length && scope.classList?.contains('sbi-aide-calculator')) roots.push(scope);

  roots.forEach((root) => {
    if (root.dataset.sbiAidCalculatorReady === SBI_AID_CALCULATOR_VERSION) {
      updateResult(root);
      return;
    }

    root.dataset.sbiAidCalculatorReady = SBI_AID_CALCULATOR_VERSION;
    applyDefaultDates(root);

    root.addEventListener('click', (event) => {
      const button = event.target.closest?.('.aid-calc-segment[data-field]');
      if (!button || !root.contains(button)) return;

      updateSegment(button);
      updateResult(root);
    });

    root.addEventListener('input', (event) => {
      if (!event.target.matches?.('[data-aid-field]')) return;
      updateResult(root);
    });

    root.addEventListener('change', (event) => {
      if (!event.target.matches?.('[data-aid-field]')) return;
      updateResult(root);
    });

    const form = root.querySelector('.aid-calc-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      updateResult(root);
      root.querySelector('.aid-calc-result-card')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    updateResult(root);
  });
}

window.SBI_AID_CALCULATOR_VERSION = SBI_AID_CALCULATOR_VERSION;
window.SBI_INIT_AID_CALCULATOR = initSbiAidCalculator;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSbiAidCalculator(document), { once: true });
} else {
  initSbiAidCalculator(document);
}

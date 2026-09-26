/**
 * Payslip document — a faithful port of the approved "salary slip generator" design
 * (Plus Jakarta Sans, ink/mint/emerald palette, mint rule, two-column ledger, dark net-pay
 * bar, attendance strip, signature line, mint footer bar, auto-fit to one A4 page).
 *
 * It renders a complete standalone HTML document from a PayslipData snapshot, so the
 * in-app preview (iframe), browser print, the server-side PDF (Puppeteer) and the email
 * attachment are all produced from exactly the same markup.
 *
 * To adapt to a different house style, change PAYSLIP_CSS / the markup below; the data
 * contract (PayslipData) stays the same.
 */
import { amountInWords, currencySymbol, formatMoney, maskAccount } from "@/lib/money";
import { formatDate, monthLabel } from "@/lib/dates";

export type PayslipTemplateConfig = {
  accent: string; // emerald
  mint: string;
  ink: string;
  showAttendance: boolean;
  showStatutory: boolean;
  showBank: boolean;
  maskAccount: boolean;
  showSignature: boolean;
  signedBy: string | null;
  footerNote: string | null;
  numberPrefix: string;
};

export type PayslipData = {
  payslipNumber: string;
  issuedOn: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  currency: string;
  company: { name: string; address?: string | null; email?: string | null; phone?: string | null; regNo?: string | null; logo?: string | null };
  employee: {
    name: string; code: string; designation: string; department: string; joiningDate: string;
    location?: string | null; pan?: string | null; uan?: string | null; pfNumber?: string | null; esiNumber?: string | null;
  };
  attendance: { workingDays: number; presentDays: number; paidDays: number; lopDays: number; leaveBalance?: number | null };
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  bank: { name: string; holder: string; account: string; ifsc: string; branch?: string | null } | null;
  payment: { mode?: string | null; creditDate?: string | null; reference?: string | null; status: string; actualCredit?: number | null };
  signature?: string | null;
  template: PayslipTemplateConfig;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function dl(pairs: [string, string | null | undefined][]) {
  return pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

const PAYMENT_STATUS: Record<string, string> = { PENDING: "Pending", PROCESSING: "Processing", PAID: "Paid", FAILED: "Failed", ON_HOLD: "On hold" };

export const PAYSLIP_CSS = `
:root{
  --ink:#0E1A16;--ink-soft:#3C4C46;--muted:#66766F;--mint:#B8F3E5;--emerald:#0B6B52;
  --rule:#D7E4DF;--rule-strong:#0E1A16;--bg:#EDF1EF;--paper:#fff;--page-h:297mm;
  --font:'Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg)}
body{font-family:var(--font);color:var(--ink);-webkit-font-smoothing:antialiased}
.stage{padding:24px;display:flex;justify-content:center}
.sheet-wrap{transform-origin:top center}
.sheet{
  width:210mm;height:var(--page-h);background:var(--paper);
  box-shadow:0 18px 50px rgba(14,26,22,.16);
  display:flex;flex-direction:column;overflow:hidden;position:relative;
  font-size:10.2pt;line-height:1.45;
}
.sheet-fit{flex:1;min-height:0;overflow:hidden}
.sheet-main{
  padding:15mm 15mm 6mm;display:flex;flex-direction:column;
  width:calc(100% / var(--k,1));min-height:calc(100% / var(--k,1));
  transform:scale(var(--k,1));transform-origin:top left;
}
.masthead{display:flex;justify-content:space-between;align-items:flex-start;gap:18mm}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.logo{max-height:15mm;max-width:45mm;object-fit:contain}
.brand-name{font-size:26pt;font-weight:800;letter-spacing:-1px;line-height:1}
.brand-sub{font-size:8.6pt;color:var(--muted);margin-top:5px;max-width:70mm}
.doc-meta{text-align:right;flex:0 0 auto}
.doc-kind{font-size:13pt;font-weight:700;letter-spacing:-.2px}
.doc-period{font-size:15pt;font-weight:800;color:var(--emerald);margin-top:2px;letter-spacing:-.3px}
.doc-slip{font-size:8.6pt;color:var(--muted);margin-top:5px}
.mint-rule{height:4px;background:var(--mint);margin:7mm 0 6mm}
.details{display:grid;grid-template-columns:1fr 1fr;gap:6mm 12mm}
.detail-head{font-size:9.4pt;font-weight:700;padding-bottom:4px;border-bottom:1px solid var(--rule);margin-bottom:7px}
.dl{display:grid;grid-template-columns:34mm 1fr;row-gap:5px;column-gap:6px;font-size:9.4pt}
.dl dt{color:var(--muted)}
.dl dd{color:var(--ink);font-weight:600;word-break:break-word}
.attendance{display:flex;gap:0;margin:6mm 0 0;border:1px solid var(--rule);border-radius:8px;overflow:hidden}
.att{flex:1;padding:7px 10px;border-right:1px solid var(--rule)}
.att:last-child{border-right:none}
.att b{display:block;font-size:12pt;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.att span{font-size:8.2pt;color:var(--muted)}
.ledger{width:100%;border-collapse:collapse;margin-top:6mm;font-variant-numeric:tabular-nums}
.ledger th,.ledger td{padding:6px 10px;text-align:left;font-size:9.6pt}
.ledger thead th{background:var(--mint);font-weight:700;font-size:9.6pt;border-top:1px solid var(--rule-strong);border-bottom:1px solid var(--rule-strong)}
.ledger .amt{text-align:right;width:26mm;white-space:nowrap}
.ledger .mid{border-left:1px solid var(--rule-strong)}
.ledger tbody td{border-bottom:1px solid var(--rule)}
.ledger tbody tr:last-child td{border-bottom:1px solid var(--rule-strong)}
.ledger tfoot td{font-weight:700;padding-top:8px;padding-bottom:8px}
.ledger .blank{color:transparent}
.netpay{background:var(--ink);color:#fff;margin-top:6mm;padding:9px 12px;display:flex;justify-content:space-between;align-items:baseline;gap:10mm}
.netpay .lab{font-size:10.5pt;font-weight:700}
.netpay .val{font-size:19pt;font-weight:800;color:var(--mint);letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.in-words{font-size:9pt;color:var(--ink-soft);padding:6px 12px;background:color-mix(in srgb,var(--mint) 35%,transparent)}
.pay-block{display:grid;grid-template-columns:1fr 1fr;gap:6mm 12mm;margin-top:6mm}
.sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:10mm;gap:10mm}
.sign-block{flex:0 0 auto;text-align:center}
.sign-img{display:block;max-height:18mm;max-width:50mm;object-fit:contain;margin:0 auto 3px;mix-blend-mode:multiply}
.sign-line{width:52mm;border-top:1px solid var(--ink);padding-top:5px;font-size:8.6pt;color:var(--ink-soft);text-align:center}
.contact{font-size:8.6pt;color:var(--muted);line-height:1.6}
.contact b{color:var(--ink);font-weight:600}
.footer-bar{background:var(--mint);padding:9px 15mm;font-size:8.6pt;color:#12332A;text-align:center}
.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}
.watermark span{font-size:96pt;font-weight:800;letter-spacing:8px;color:rgba(14,26,22,.06);transform:rotate(-30deg)}
@media print{
  :root{--page-h:296mm}
  html,body{margin:0;padding:0;height:auto;background:#fff}
  .stage{display:block;padding:0;margin:0}
  .sheet-wrap{transform:none!important;height:auto!important}
  .sheet{width:210mm;height:var(--page-h);box-shadow:none;page-break-after:avoid;break-after:avoid}
  .netpay,.footer-bar,.ledger thead th,.in-words,.mint-rule,.attendance{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:0}
}
`;

/* Shrinks the page body until it fits one A4 sheet (from the original template), and in
   screen mode scales the whole sheet to the frame width so previews never scroll sideways. */
const FIT_SCRIPT = `
(function(){
  function fitPage(){
    var main=document.getElementById('sheetMain'), fit=document.getElementById('sheetFit');
    if(!main||!fit) return;
    var available=fit.clientHeight; if(!available) return;
    var k=1;
    for(var i=0;i<6;i++){
      main.style.setProperty('--k',k);
      var needed=main.offsetHeight;
      var next=Math.min(1,(available/needed)*0.998);
      if(Math.abs(next-k)<0.002) break;
      k=Math.max(0.6,next);
    }
    main.style.setProperty('--k',k);
    document.documentElement.setAttribute('data-fit',String(Math.round(k*100)));
  }
  function fitScreen(){
    var wrap=document.getElementById('sheetWrap'), sheet=document.getElementById('sheet');
    if(!wrap||!sheet||document.body.getAttribute('data-mode')!=='screen') return;
    var avail=document.documentElement.clientWidth-48;
    var s=Math.min(1,avail/sheet.offsetWidth);
    wrap.style.transform='scale('+s+')';
    wrap.style.height=(sheet.offsetHeight*s)+'px';
  }
  function all(){fitPage();fitScreen();}
  all();
  window.addEventListener('resize',fitScreen);
  window.addEventListener('beforeprint',fitPage);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){all();window.__payslipReady=true;});
  else window.__payslipReady=true;
  Array.prototype.forEach.call(document.images,function(img){ if(!img.complete) img.addEventListener('load',all); });
})();
`;

export function renderPayslipHtml(d: PayslipData, opts: { mode?: "screen" | "print"; draft?: boolean; /** Inline @font-face CSS; when given, no web-font request is made. */ fontCss?: string } = {}) {
  const t = d.template;
  const cur = d.currency;
  const money = (n: number) => formatMoney(n, cur).replace(/^(\D+)/, "$1 ").replace(/\s+/, " ");
  const period = monthLabel(d.month);

  const n = Math.max(d.earnings.length, d.deductions.length, 1);
  let rows = "";
  for (let i = 0; i < n; i++) {
    const e = d.earnings[i];
    const x = d.deductions[i];
    rows +=
      `<tr><td>${e ? esc(e.label) : '<span class="blank">–</span>'}</td>` +
      `<td class="amt">${e ? money(e.amount) : ""}</td>` +
      `<td class="mid">${x ? esc(x.label) : '<span class="blank">–</span>'}</td>` +
      `<td class="amt">${x ? money(x.amount) : ""}</td></tr>`;
  }

  const att = d.attendance;
  const cells: [string, string][] = [
    [fmtNum(att.workingDays), "Working days"],
    [fmtNum(att.presentDays), "Present days"],
    [fmtNum(att.paidDays), "Paid days"],
    [fmtNum(att.lopDays), "Loss of pay"],
  ];
  if (att.leaveBalance != null) cells.push([fmtNum(att.leaveBalance), "Leave balance"]);

  const credited = d.payment.actualCredit;
  const creditDiffers = credited != null && Math.abs(credited - d.net) > 0.005;

  const contact = [
    d.company.address ? `<b>${esc(d.company.name)}</b><br>${esc(d.company.address)}` : "",
    [d.company.email, d.company.phone].filter(Boolean).map(esc).join(" · "),
  ].filter(Boolean).join("<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(d.payslipNumber)} · ${esc(d.employee.name)} · ${esc(period)}</title>
${opts.fontCss ? "" : `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">`}
<style>${opts.fontCss ?? ""}
${PAYSLIP_CSS}
:root{--ink:${t.ink};--rule-strong:${t.ink};--mint:${t.mint};--emerald:${t.accent}}
${opts.mode === "print" ? ".stage{padding:0}.sheet{box-shadow:none}html,body{background:#fff}" : ""}
</style>
</head>
<body data-mode="${opts.mode ?? "screen"}">
<main class="stage">
<div class="sheet-wrap" id="sheetWrap">
<section class="sheet" id="sheet">
  ${opts.draft ? '<div class="watermark"><span>PREVIEW</span></div>' : ""}
  <div class="sheet-fit" id="sheetFit">
  <div class="sheet-main" id="sheetMain">

    <header class="masthead">
      <div class="brand">
        ${d.company.logo ? `<img class="logo" src="${esc(d.company.logo)}" alt="">` : ""}
        <div>
          <div class="brand-name">${esc(d.company.name)}</div>
          <div class="brand-sub">${[d.company.address, d.company.regNo].filter(Boolean).map(esc).join(" · ")}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-kind">Salary slip</div>
        <div class="doc-period">${esc(period)}</div>
        <div class="doc-slip">${["Slip " + esc(d.payslipNumber), d.issuedOn ? "Issued " + esc(formatDate(d.issuedOn)) : ""].filter(Boolean).join(" · ")}</div>
      </div>
    </header>

    <div class="mint-rule"></div>

    <div class="details">
      <div>
        <div class="detail-head">Employee</div>
        <dl class="dl">${dl([
          ["Name", d.employee.name],
          ["Employee ID", d.employee.code],
          ["Designation", d.employee.designation],
          ["Department", d.employee.department],
          ["Date of joining", formatDate(d.employee.joiningDate)],
          ["Location", d.employee.location],
        ])}</dl>
      </div>
      ${t.showStatutory ? `<div>
        <div class="detail-head">Statutory</div>
        <dl class="dl">${dl([
          ["PAN", d.employee.pan],
          ["UAN", d.employee.uan],
          ["PF account", d.employee.pfNumber],
          ["ESIC number", d.employee.esiNumber],
        ])}</dl>
      </div>` : "<div></div>"}
    </div>

    ${t.showAttendance ? `<div class="attendance">${cells.map(([v, l]) => `<div class="att"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>` : ""}

    <table class="ledger">
      <thead>
        <tr>
          <th>Earnings</th><th class="amt">${esc(currencySymbol(cur))}</th>
          <th class="mid">Deductions</th><th class="amt">${esc(currencySymbol(cur))}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>Gross earnings</td><td class="amt">${money(d.gross)}</td>
          <td class="mid">Total deductions</td><td class="amt">${money(d.totalDeductions)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="netpay">
      <span class="lab">Net pay</span>
      <span class="val">${money(d.net)}</span>
    </div>
    <div class="in-words">${esc(amountInWords(d.net, cur))}</div>

    <div class="pay-block">
      ${t.showBank && d.bank ? `<div>
        <div class="detail-head">Paid into</div>
        <dl class="dl">${dl([
          ["Bank", d.bank.name],
          ["Account holder", d.bank.holder],
          ["Account number", t.maskAccount ? maskAccount(d.bank.account) : d.bank.account],
          ["IFSC", d.bank.ifsc],
          ["Branch", d.bank.branch],
        ])}</dl>
      </div>` : "<div></div>"}
      <div>
        <div class="detail-head">Payment</div>
        <dl class="dl">${dl([
          ["Mode", d.payment.mode],
          ["Paid on", d.payment.creditDate ? formatDate(d.payment.creditDate) : null],
          ["Amount credited", creditDiffers ? money(credited!) : null],
          ["Reference", d.payment.reference],
          ["Pay period", period],
          ["Status", PAYMENT_STATUS[d.payment.status] ?? d.payment.status],
        ])}</dl>
      </div>
    </div>

    <div class="sign">
      <div class="contact">${contact}</div>
      ${t.showSignature ? `<div class="sign-block">
        ${d.signature ? `<img class="sign-img" src="${esc(d.signature)}" alt="">` : ""}
        <div class="sign-line">${esc(t.signedBy ?? "")}</div>
      </div>` : ""}
    </div>

  </div>
  </div>
  ${t.footerNote ? `<div class="footer-bar">${esc(t.footerNote)}</div>` : ""}
</section>
</div>
</main>
<script>${FIT_SCRIPT}</script>
</body>
</html>`;
}

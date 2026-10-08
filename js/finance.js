// Regras puras: valores em centavos e datas locais YYYY-MM-DD, sem fuso horário.
export const CURRENT_SCHEMA = 3;
export const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const money = cents => (cents / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
export const displayDate = date => date ? date.split('-').reverse().join('/') : 'Data pendente';
export function cents(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Informe um valor positivo com até duas casas decimais.');
  const [units, fraction = ''] = text.split('.');
  const result = Number(units) * 100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 999999999999) throw new Error('Valor fora do limite permitido.');
  return result;
}
export function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const [y,m,d] = date.split('-').map(Number);
  return y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y,m,0)).getUTCDate();
}
export function addMonths(date, offset) {
  if (!validDate(date)) throw new Error('Informe uma data válida.');
  const [y,m,d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y,m-1+offset,1));
  const ty = target.getUTCFullYear(), tm = target.getUTCMonth()+1;
  const day = Math.min(d, new Date(Date.UTC(ty,tm,0)).getUTCDate());
  const result = `${ty}-${String(tm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if (!validDate(result)) throw new Error('O período ultrapassa o limite de datas.');
  return result;
}
function monthDate(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) throw new Error('Competência inválida.');
  const date = `${value}-01`;
  if (!validDate(date)) throw new Error('Competência inválida.');
  return date;
}
function paymentTotal(occurrence) { return (occurrence.payments || []).reduce((sum,p)=>sum + (Number.isSafeInteger(p.cents) ? p.cents : 0),0); }
function upgradeOccurrence(occurrence, index=0) {
  const result = {...structuredClone(occurrence)};
  result.id = result.id || `p${index+1}`;
  result.payments = Array.isArray(result.payments) ? result.payments.filter(p=>p && validDate(p.date) && Number.isSafeInteger(p.cents) && p.cents > 0).map((p,i)=>({id:p.id || `legacy-pay-${i}`,date:p.date,cents:p.cents,...(p.estimated?{estimated:true}:{})})) : [];
  if (!result.payments.length && result.settled && validDate(result.settledDate) && Number.isSafeInteger(result.cents) && result.cents > 0) {
    result.payments = [{id:'legacy-settled',date:result.settledDate,cents:result.cents}];
  }
  delete result.settled;
  delete result.settledDate;
  return result;
}
export function schedule(total, count, firstDate, recurring = false) {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Valor inválido.');
  if (!Number.isInteger(count) || count < 1 || count > 360) throw new Error('Use entre 1 e 360 meses.');
  if (!recurring && total < count) throw new Error('Cada parcela precisa ter ao menos R$ 0,01.');
  return Array.from({length:count}, (_,i) => ({
    id:`p${i+1}`, date:addMonths(firstDate,i),
    cents:recurring ? total : Math.floor(total/count) + (i < total % count ? 1 : 0),
    payments:[], estimated:false
  }));
}
export function customSchedule(amount, months) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Valor inválido.');
  const unique = [...new Set((months || []).map(String))].sort();
  if (!unique.length || unique.length > 360) throw new Error('Selecione entre 1 e 360 competências.');
  return unique.map((month,i)=>({id:`p${i+1}`,date:monthDate(month),cents:amount,payments:[],estimated:false}));
}
function inclusiveMonthCount(startDate,endDate) {
  if (!validDate(startDate) || !validDate(endDate)) throw new Error('Informe um intervalo de datas válido.');
  const [sy,sm]=startDate.split('-').map(Number),[ey,em]=endDate.split('-').map(Number);
  const count=(ey-sy)*12+(em-sm)+1;
  if (count<1) throw new Error('A data final deve ser igual ou posterior ao primeiro vencimento.');
  if (count>360) throw new Error('O intervalo pode ter no máximo 360 meses.');
  return count;
}
function recurringOccurrence(entry, month) {
  if (!entry?.openEnded || entry.mode!=='monthly' || entry.category!=='Fixa' || !validDate(entry.firstDate) || !/^\d{4}-\d{2}$/.test(month||'')) return null;
  const [fy,fm]=entry.firstDate.slice(0,7).split('-').map(Number),[y,m]=month.split('-').map(Number),offset=(y-fy)*12+(m-fm);
  if (offset<0) return null;
  const date=addMonths(entry.firstDate,offset);
  if (date.slice(0,7)!==month) return null;
  return {id:`m-${month}`,date,cents:entry.amountCents,payments:[],estimated:false};
}
export function makeEntry({id, name, value, date, endDate, count, mode, category='Fixa', revision=0, months=[]}) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 160) throw new Error('Informe um nome com até 160 caracteres.');
  if (!['single','installments','monthly','custom'].includes(mode)) throw new Error('Modalidade inválida.');
  const amount = cents(value);
  if (mode === 'custom') {
    const occurrences = customSchedule(amount,months);
    return {id,name:trimmed,mode,category,amountCents:amount,firstDate:occurrences[0].date,count:occurrences.length,revision,pendingReview:false,occurrences};
  }
  if (mode==='monthly' && category==='Fixa') {
    if (!validDate(date)) throw new Error('Informe uma data válida.');
    return {id,name:trimmed,mode,category,amountCents:amount,firstDate:date,count:null,openEnded:true,revision,pendingReview:false,occurrences:[]};
  }
  if (mode==='monthly' && category==='Fixa até') {
    const periods=inclusiveMonthCount(date,endDate);
    return {id,name:trimmed,mode,category,amountCents:amount,firstDate:date,endDate,count:periods,openEnded:false,revision,pendingReview:false,occurrences:schedule(amount,periods,date,true)};
  }
  const periods = mode === 'single' ? 1 : Number(count);
  return {id, name:trimmed, mode, category, amountCents:amount, firstDate:date,
    count:periods, openEnded:false, revision, pendingReview:false, occurrences:schedule(amount,periods,date,mode==='monthly')};
}
function modernEntry(entry,index,prefix) {
  return {
    ...structuredClone(entry),
    id:entry.id || `${prefix}-${index}`,
    revision:Number.isInteger(entry.revision)&&entry.revision>=0?entry.revision:0,
    pendingReview:!!entry.pendingReview,
    occurrences:(entry.occurrences || []).map(upgradeOccurrence)
  };
}
function oldMonthDate(year,monthName) {
  const mi = MONTHS.indexOf(monthName);
  const y = Number(year);
  if (!Number.isInteger(y) || mi < 0) return null;
  const result = `${String(y).padStart(4,'0')}-${String(mi+1).padStart(2,'0')}-01`;
  return validDate(result) ? result : null;
}
function oldIntervalDates(interval) {
  if (!interval?.inicio || !interval?.fim) return [];
  const startYear=Number(interval.inicio.ano), endYear=Number(interval.fim.ano), startMonth=Number(interval.inicio.mesIndex), endMonth=Number(interval.fim.mesIndex);
  if (![startYear,endYear,startMonth,endMonth].every(Number.isInteger) || startMonth<0 || startMonth>11 || endMonth<0 || endMonth>11) return [];
  const start=startYear*12+startMonth, end=endYear*12+endMonth;
  if (end < start || end-start+1 > 360) return [];
  return Array.from({length:end-start+1},(_,i)=>{const abs=start+i,y=Math.floor(abs/12),m=abs%12;return `${y}-${String(m+1).padStart(2,'0')}-01`;});
}
function paymentsFromOldStatus(status, date, plannedCents) {
  if (!status) return [];
  const normalized = typeof status === 'string' ? {situacao:status,valorParcial:0} : status;
  const situation = normalized?.situacao || 'Pendente';
  const amount = situation === 'Pago' ? plannedCents : situation === 'Parcial' ? Math.round(Number(normalized.valorParcial || 0)*100) : 0;
  if (!Number.isSafeInteger(amount) || amount <= 0) return [];
  return [{id:`legacy-pay-${date}`,date,cents:Math.min(plannedCents,amount),estimated:true}];
}
function migrateCurrentGitHubEntry(raw,index,collection) {
  const amount=Math.round(Number(raw.valor)*100), name=String(raw.nome || '').trim(), type=raw.tipo || 'Fixa';
  const base={id:`github-${collection[0]}-${index}`,name,amountCents:amount,category:collection==='despesas'?(type==='Variável'?'Variável':type==='FixaAte'?'Fixa até':'Fixa'):'Fixa',revision:0,pendingReview:false,legacy:structuredClone(raw)};
  if (!name || !Number.isSafeInteger(amount) || amount<=0) return {...base,mode:'legacy',count:1,firstDate:null,pendingReview:true,occurrences:[]};
  let dates=[];
  if (type==='FixaAte') dates=oldIntervalDates(raw.intervaloCompleto);
  else if ((type==='Extra'||type==='Variável') && raw.mesesPorAno && typeof raw.mesesPorAno==='object') {
    for (const [year,months] of Object.entries(raw.mesesPorAno)) for (const month of months || []) { const d=oldMonthDate(year,month); if (d) dates.push(d); }
    dates=[...new Set(dates)].sort();
  }
  if (!dates.length) return {...base,mode:'legacy',count:1,firstDate:null,pendingReview:true,occurrences:[]};
  const occurrences=dates.map((date,i)=>{
    const [year,month]=date.split('-');
    const monthName=MONTHS[Number(month)-1];
    const status=raw.statusPagamento?.[`${monthName}_${year}`];
    return {id:`p${i+1}`,date,cents:amount,payments:paymentsFromOldStatus(status,date,amount),estimated:true};
  });
  return {...base,mode:(type==='FixaAte'?'monthly':'custom'),count:occurrences.length,firstDate:occurrences[0].date,...(type==='FixaAte'?{endDate:occurrences.at(-1).date}:{}),occurrences};
}
function parseBrazilDate(value) {
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value||''));
  if (!match) return null;
  const date=`${match[3]}-${match[2]}-${match[1]}`;
  return validDate(date)?date:null;
}
function migrateEconomy(items=[]) {
  return items.map((item,i)=>{
    if (item && Number.isSafeInteger(item.cents) && validDate(item.date)) return {...structuredClone(item),id:item.id||`eco-${i}`,revision:Number.isInteger(item.revision)?item.revision:0};
    const rawCents=Math.round(Math.abs(Number(item?.valor))*100);
    const kind=Number(item?.valor)<0 || item?.tipo==='Saque' ? 'withdraw' : 'deposit';
    return {id:`github-e-${i}`,name:String(item?.motivo||item?.name||'Movimentação'),kind,cents:Number.isSafeInteger(rawCents)&&rawCents>0?rawCents:0,date:parseBrazilDate(item?.data)||today(),revision:0,legacy:structuredClone(item)};
  }).filter(item=>item.cents>0);
}
function finalize(data) {
  const result={...structuredClone(data),schemaVersion:CURRENT_SCHEMA};
  result.revision=Number.isInteger(result.revision)&&result.revision>=0?result.revision:0;
  result.receitas=(result.receitas||[]).map((e,i)=>modernEntry(e,i,'r'));
  result.despesas=(result.despesas||[]).map((e,i)=>modernEntry(e,i,'d'));
  result.itens=(result.itens||[]).map((item,i)=>typeof item==='string'?{id:`n-${i}`,text:item}:item).filter(Boolean);
  result.economia=migrateEconomy(result.economia||[]);
  return result;
}
// Conversão determinística e sem gravação durante a leitura. Registros ambíguos ficam
// pendingReview e o original permanece em legacy para auditoria.
export function normalize(raw = {}) {
  if (raw.schemaVersion != null && ![1,2,3].includes(raw.schemaVersion)) throw new Error('Este arquivo usa uma versão mais recente. Atualize o aplicativo antes de editar.');
  if (raw.schemaVersion === 3) return finalize(raw);
  if ([1,2].includes(raw.schemaVersion) && [...(raw.receitas || []), ...(raw.despesas || [])].every(entry => entry && 'amountCents' in entry && Array.isArray(entry.occurrences))) return finalize(raw);
  const looksLikeCurrentGitHub=[...(raw.receitas||[]),...(raw.despesas||[])].some(e=>e && ('mesesPorAno' in e || 'intervaloCompleto' in e || 'statusPagamento' in e)) || Array.isArray(raw.economia);
  if (looksLikeCurrentGitHub) {
    return finalize({schemaVersion:CURRENT_SCHEMA,revision:0,
      receitas:(raw.receitas||[]).map((r,i)=>migrateCurrentGitHubEntry(r,i,'receitas')),
      despesas:(raw.despesas||[]).map((d,i)=>migrateCurrentGitHubEntry(d,i,'despesas')),
      itens:(raw.itens||[]).map((text,i)=>typeof text==='string'?{id:`github-n-${i}`,text:String(text)}:text),
      economia:migrateEconomy(raw.economia||[])});
  }
  const result={...structuredClone(raw),schemaVersion:CURRENT_SCHEMA,revision:0,economia:[]};
  result.receitas=(raw.receitas||[]).map((r,i)=>({id:`legacy-r-${i}`,name:String(r.nome||''),amountCents:Math.round(Number(r.valor)*100),mode:'single',count:1,firstDate:null,pendingReview:true,revision:0,occurrences:[],legacy:structuredClone(r)}));
  result.despesas=(raw.despesas||[]).map((d,i)=>{
    const amount=Math.round(Number(d.valor)*100),months=[...new Set(d.meses||[])].map(m=>MONTHS.indexOf(m)).sort((a,b)=>a-b),year=d.ano==null||d.ano===''?null:String(d.ano);
    const valid=Number.isSafeInteger(amount)&&amount>0&&year!==null&&months.length===Number(d.parcelas)&&months.length>0&&months.every(m=>m>=0)&&validDate(`${year}-01-01`);
    const occurrences=valid?months.map((m,j)=>({id:`p${j+1}`,date:`${year}-${String(m+1).padStart(2,'0')}-01`,cents:Math.floor(amount/months.length)+(j<amount%months.length?1:0),payments:[],estimated:true})):[];
    return {id:`legacy-d-${i}`,name:String(d.nome||''),amountCents:amount,mode:'legacy',category:d.tipo||'Fixa',count:Number(d.parcelas)||1,firstDate:occurrences[0]?.date||null,pendingReview:!valid,revision:0,occurrences,legacy:structuredClone(d)};
  });
  result.itens=(raw.itens||[]).map((text,i)=>({id:`legacy-n-${i}`,text:String(text)}));
  return finalize(result);
}
export function occurrencesFor(data, month) {
  const result=[];
  for (const collection of ['receitas','despesas']) for (const entry of data[collection] || []) {
    const persisted=(entry.occurrences||[]).filter(occurrence=>!month||occurrence.date.slice(0,7)===month);
    const rows=[...persisted];
    if(month && entry.openEnded && !persisted.some(occurrence=>occurrence.date.slice(0,7)===month)){
      const virtual=recurringOccurrence(entry,month);if(virtual)rows.push(virtual);
    }
    for (const occurrence of rows) {
      const paid=paymentTotal(occurrence), outstanding=Math.max(0,occurrence.cents-paid), settled=outstanding===0&&occurrence.cents>0;
      const payments=(occurrence.payments||[]).map(p=>({...p})),persistedIndex=(entry.occurrences||[]).findIndex(item=>item.id===occurrence.id);
      result.push({...occurrence,payments,paymentCents:paid,outstandingCents:outstanding,settled,partial:paid>0&&!settled,settledDate:settled?payments.filter(p=>!p.estimated).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.date||null:null,
        entryId:entry.id,name:entry.name,category:entry.category,collection,revision:entry.revision,index:persistedIndex>=0?persistedIndex+1:null,count:entry.openEnded?null:entry.occurrences.length});
    }
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date));
}
export function summarize(data, month) {
  const rows=occurrencesFor(data,month),sum=collection=>rows.filter(r=>r.collection===collection).reduce((s,r)=>s+r.cents,0);
  const income=sum('receitas'),expenses=sum('despesas');
  let actualIncome=0,actualExpenses=0;
  for (const collection of ['receitas','despesas']) for (const entry of data[collection]||[]) for (const occurrence of entry.occurrences||[]) for (const payment of occurrence.payments||[]) if (payment.date?.slice(0,7)===month) {
    if (collection==='receitas') actualIncome+=payment.cents; else actualExpenses+=payment.cents;
  }
  return {income,expenses,balance:income-expenses,actualIncome,actualExpenses,actualBalance:actualIncome-actualExpenses,commitment:income?expenses/income*100:expenses?null:0,rows};
}
export function economyBalance(data) {
  return (data.economia||[]).reduce((sum,item)=>sum + (item.kind==='withdraw'?-item.cents:item.cents),0);
}
export function applyOperation(raw, op) {
  const data=normalize(raw);
  if (op.type==='clear') {
    if (data.revision!==op.expectedRevision) throw new Error('Os dados mudaram em outro dispositivo. Revise antes de apagar.');
    return {...data,receitas:[],despesas:[],itens:[],economia:[],revision:data.revision+1};
  }
  if (!['receitas','despesas','itens','economia'].includes(op.collection)) throw new Error('Coleção inválida.');
  const list=data[op.collection],index=list.findIndex(e=>e.id===op.id);
  if (op.type==='add') {
    if (index>=0) return data;
    list.push(structuredClone(op.entry));
  } else {
    if (index<0) throw new Error('Este item foi excluído em outro dispositivo.');
    const current=list[index];
    if (!['itens'].includes(op.collection) && current.revision!==op.expectedRevision) throw new Error('Este lançamento mudou em outro dispositivo. Feche e abra novamente para revisar.');
    if (op.type==='remove') list.splice(index,1);
    else if (op.type==='edit') list[index]={...structuredClone(op.entry),id:current.id,revision:(current.revision||0)+1};
    else if (['payment','removePayment','settle'].includes(op.type)) {
      if (!['receitas','despesas'].includes(op.collection)) throw new Error('Operação inválida.');
      let occurrence=current.occurrences.find(p=>p.id===op.occurrenceId);
      if (!occurrence && current.openEnded && /^m-\d{4}-\d{2}$/.test(op.occurrenceId||'')) {
        occurrence=recurringOccurrence(current,op.occurrenceId.slice(2));
        if(occurrence){current.occurrences.push(occurrence);current.occurrences.sort((a,b)=>a.date.localeCompare(b.date));}
      }
      if (!occurrence) throw new Error('Parcela não encontrada.');
      occurrence.payments=occurrence.payments||[];
      if (op.type==='payment') {
        if (!validDate(op.date)||op.date>today()) throw new Error('Informe uma data válida, até hoje.');
        if (!Number.isSafeInteger(op.cents)||op.cents<=0) throw new Error('Informe um valor válido.');
        if (occurrence.payments.some(p=>p.id===op.paymentId)) return data;
        const paid=paymentTotal(occurrence);
        if (paid+op.cents>occurrence.cents) throw new Error(`O valor ultrapassa o restante de ${money(occurrence.cents-paid)}.`);
        occurrence.payments.push({id:op.paymentId,date:op.date,cents:op.cents});
      } else if (op.type==='removePayment') {
        const paymentIndex=occurrence.payments.findIndex(p=>p.id===op.paymentId);
        if (paymentIndex<0) throw new Error('Pagamento não encontrado.');
        occurrence.payments.splice(paymentIndex,1);
      } else if (op.type==='settle') {
        if (op.settled) {
          if (!validDate(op.date)||op.date>today()) throw new Error('Informe uma data de pagamento válida, até hoje.');
          occurrence.payments=[{id:'settled',date:op.date,cents:occurrence.cents}];
        } else occurrence.payments=[];
      }
      current.revision++;
    } else throw new Error('Operação inválida.');
  }
  data.revision=(data.revision||0)+1;
  return data;
}
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3x59FAfccii5ob2VXcR-QSVK0KvHxOGA",
    authDomain: "vendedores-empresa-solon.firebaseapp.com",
    projectId: "vendedores-empresa-solon",
    storageBucket: "vendedores-empresa-solon.firebasestorage.app",
    messagingSenderId: "297076691668",
    appId: "1:297076691668:web:4cae0c8f9ece1bc4ad2141"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Erro na persistência:", error);
});

let docRef = null; 
let dadosLocais = { itens: [], receitas: [], despesas: [], economia: [] };
let unsubscribeFirestore = null;
let currentUserUid = null;
let fotoBase64Temporaria = ""; 

let filtroExtratoAtual = 'Todos';
let anoSelecionadoCriacao = new Date().getFullYear().toString();
let anoSelecionadoCriacaoReceita = new Date().getFullYear().toString();

const mesesOrdem = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

let selecaoMesesFixaInicio = null; 
let selecaoMesesFixaFim = null;    
let selecaoMesesVariavelMap = {}; 
let selecaoMesesReceitaMap = {};

let indexEditandoDespesa = -1;
let anoEditandoDespesaAnoSel = new Date().getFullYear().toString();
let editMesesFixaInicio = null;
let editMesesFixaFim = null;
let editMesesVariavelMap = {};
let editDespesaFoiModificada = false;
let tipoModalEmEdicaoAtual = '';

let indexEditandoReceita = -1;
let anoEditandoReceitaAnoSel = new Date().getFullYear().toString();
let editMesesReceitaMap = {};
let editReceitaFoiModificada = false;

let statusIndexDespesaModal = -1;
let statusMesModal = '';
let statusAnoModal = '';
let statusFoiModificado = false;

let funcaoExclusaoCallback = null;
let touchStartX = 0;
let touchEndX = 0;

// Variáveis globais de controle de filtro nas abas
window.modoFiltroReceita = 'todos';
window.modoFiltroDespesa = 'todos';

window.addEventListener('DOMContentLoaded', () => {
    verificarDispositivoMobile();

    const menuEl = document.getElementById('menuLateralApp');
    if (menuEl) {
        menuEl.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, false);
        menuEl.addEventListener('touchend', (e) => { touchEndX = e.changedTouches[0].screenX; handleSwipeGesture(); }, false);
    }

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('menuLateralApp');
        const btnHamburguer = document.querySelector('.btn-hamburguer');
        if (document.body.classList.contains('modo-mobile') && menu && menu.classList.contains('aberto')) {
            if (!menu.contains(e.target) && btnHamburguer && !btnHamburguer.contains(e.target)) {
                alternarMenuMobile();
            }
        }
    });

    const temaSalvo = localStorage.getItem('temaSolon') || 'claro';
    const fonteSalva = localStorage.getItem('fonteSolon') || 'Arial, sans-serif';
    
    aplicarTemaVisual(temaSalvo);
    document.body.style.fontFamily = fonteSalva;
    
    const selTema = document.getElementById('selectTema');
    const selFonte = document.getElementById('selectFonte');
    if(selTema) selTema.value = temaSalvo;
    if(selFonte) selFonte.value = fonteSalva;

    const mesAtual = mesesOrdem[new Date().getMonth()];
    const anoAtual = new Date().getFullYear().toString();
    
    // Filtros Gerais Home
    const mesSalvo = localStorage.getItem('mesSelecionadoSolon') || mesAtual;
    const anoSalvo = localStorage.getItem('anoSelecionadoSolon') || anoAtual;
    if(document.getElementById('filtroMes')) document.getElementById('filtroMes').value = mesSalvo;
    if(document.getElementById('filtroAno')) document.getElementById('filtroAno').value = anoSalvo;

    // Filtros Aba Receitas
    window.modoFiltroReceita = localStorage.getItem('modoFiltroReceita') || 'todos';
    if(document.getElementById('filtroMesReceitaLista')) document.getElementById('filtroMesReceitaLista').value = localStorage.getItem('filtroMesReceitaSelecionado') || mesAtual;
    if(document.getElementById('filtroAnoReceitaLista')) document.getElementById('filtroAnoReceitaLista').value = localStorage.getItem('filtroAnoReceitaSelecionado') || anoAtual;

    // Filtros Aba Despesas
    window.modoFiltroDespesa = localStorage.getItem('modoFiltroDespesa') || 'todos';
    if(document.getElementById('filtroMesDespesaLista')) document.getElementById('filtroMesDespesaLista').value = localStorage.getItem('filtroMesDespesaSelecionado') || mesAtual;
    if(document.getElementById('filtroAnoDespesaLista')) document.getElementById('filtroAnoDespesaLista').value = localStorage.getItem('filtroAnoDespesaSelecionado') || anoAtual;

    anoSelecionadoCriacao = anoAtual;
    anoSelecionadoCriacaoReceita = anoAtual;
    const txtAno = document.getElementById('txtAnoSelecionado');
    if(txtAno) txtAno.innerText = anoAtual;
    atualizarBotoesAnosAtivos(anoAtual, 'listaAnosSelecao');

    const txtAnoRec = document.getElementById('txtAnoSelecionadoReceita');
    if(txtAnoRec) txtAnoRec.innerText = anoAtual;
    atualizarBotoesAnosAtivos(anoAtual, 'listaAnosReceitaSelecao');

    alternarTipoDespesaUI();
    alternarTipoReceitaUI();
});

function verificarDispositivoMobile() {
    const ehMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const ehTelaEstreita = window.innerWidth <= 800;
    const ehStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (ehMobileUA || ehTelaEstreita || ehStandalone) {
        document.body.classList.add('modo-mobile');
    } else {
        document.body.classList.remove('modo-mobile');
    }
}

window.alternarMenuMobile = function() {
    const menu = document.getElementById('menuLateralApp');
    if(menu) {
        menu.classList.toggle('aberto');
        if (document.body.classList.contains('modo-mobile')) {
            if (menu.classList.contains('aberto')) {
                document.body.classList.add('menu-lateral-ativo');
            } else {
                document.body.classList.remove('menu-lateral-ativo');
            }
        }
    }
};

function handleSwipeGesture() {
    if (touchEndX - touchStartX < -50) {
        const menu = document.getElementById('menuLateralApp');
        if (menu && menu.classList.contains('aberto')) {
            menu.classList.remove('aberto');
            if (document.body.classList.contains('modo-mobile')) {
                document.body.classList.remove('menu-lateral-ativo');
            }
        }
    }
}

function aplicarTemaVisual(tema) {
    document.body.classList.remove('modo-escuro', 'modo-margaridas');
    if(tema === 'escuro') document.body.classList.add('modo-escuro');
    else if(tema === 'margaridas') document.body.classList.add('modo-margaridas');
}

window.salvarFiltroPeriodo = function() {
    localStorage.setItem('mesSelecionadoSolon', document.getElementById('filtroMes').value);
    localStorage.setItem('anoSelecionadoSolon', document.getElementById('filtroAno').value);
    atualizarAnaliseMes();
};

window.filtrarReceitasPorSelecao = function() {
    window.modoFiltroReceita = 'mes';
    const mes = document.getElementById('filtroMesReceitaLista').value;
    const ano = document.getElementById('filtroAnoReceitaLista').value;
    
    const mapa = {
        'Janeiro': 'Jan', 'Fevereiro': 'Fev', 'Março': 'Mar', 'Abril': 'Abr',
        'Maio': 'Mai', 'Junho': 'Jun', 'Julho': 'Jul', 'Agosto': 'Ago',
        'Setembro': 'Set', 'Outubro': 'Out', 'Novembro': 'Nov', 'Dezembro': 'Dez'
    };
    const mesCerto = mapa[mes] || mes;

    localStorage.setItem('filtroMesReceitaSelecionado', mesCerto);
    localStorage.setItem('filtroAnoReceitaSelecionado', ano);
    localStorage.setItem('modoFiltroReceita', 'mes');
    renderizarReceitas();
};

window.limparFiltroReceitas = function() {
    window.modoFiltroReceita = 'todos';
    localStorage.setItem('modoFiltroReceita', 'todos');
    renderizarReceitas();
};

window.filtrarDespesasPorSelecao = function() {
    window.modoFiltroDespesa = 'mes';
    const mes = document.getElementById('filtroMesDespesaLista').value;
    const ano = document.getElementById('filtroAnoDespesaLista').value;
    
    const mapa = {
        'Janeiro': 'Jan', 'Fevereiro': 'Fev', 'Março': 'Mar', 'Abril': 'Abr',
        'Maio': 'Mai', 'Junho': 'Jun', 'Julho': 'Jul', 'Agosto': 'Ago',
        'Setembro': 'Set', 'Outubro': 'Out', 'Novembro': 'Nov', 'Dezembro': 'Dez'
    };
    const mesCerto = mapa[mes] || mes;

    localStorage.setItem('filtroMesDespesaSelecionado', mesCerto);
    localStorage.setItem('filtroAnoDespesaSelecionado', ano);
    localStorage.setItem('modoFiltroDespesa', 'mes');
    renderizarDespesas();
};

window.limparFiltroDespesas = function() {
    window.modoFiltroDespesa = 'todos';
    localStorage.setItem('modoFiltroDespesa', 'todos');
    renderizarDespesas();
};

window.toggleListaAnos = function(event, idContainer) {
    event.stopPropagation();
    document.getElementById(idContainer).classList.toggle('aberto');
};

window.selejonarAnoGeral = function(ano, event) {
    event.stopPropagation();
    anoSelecionadoCriacao = ano;
    document.getElementById('txtAnoSelecionado').innerText = ano;
    document.getElementById('listaAnosSelecao').classList.remove('aberto');
    atualizarBotoesAnosAtivos(ano, 'listaAnosSelecao');
    sincronizarCheckboxesVisuaisCriacao();
};

window.selecionarAnoDespesa = function(ano, event) { selejonarAnoGeral(ano, event); };

window.selecionarAnoReceita = function(ano, event) {
    event.stopPropagation();
    anoSelecionadoCriacaoReceita = ano;
    document.getElementById('txtAnoSelecionadoReceita').innerText = ano;
    document.getElementById('listaAnosReceitaSelecao').classList.remove('aberto');
    atualizarBotoesAnosAtivos(ano, 'listaAnosReceitaSelecao');
    sincronizarCheckboxesVisuaisCriacaoReceita();
};

window.selecionarAnoDespesaEdit = function(ano, event) {
    event.stopPropagation();
    anoEditandoDespesaAnoSel = ano;
    document.getElementById('txtAnoSelecionadoEdit').innerText = ano;
    document.getElementById('listaAnosEditSelecao').classList.remove('aberto');
    atualizarBotoesAnosAtivos(ano, 'listaAnosEditSelecao');
    sincronizarCheckboxesVisuaisEditDespesa();
    editDespesaFoiModificada = true;
};

window.selecionarAnoReceitaEdit = function(ano, event) {
    event.stopPropagation();
    anoEditandoReceitaAnoSel = ano;
    document.getElementById('txtAnoSelecionadoEditReceita').innerText = ano;
    document.getElementById('listaAnosEditReceitaSelecao').classList.remove('aberto');
    atualizarBotoesAnosAtivos(ano, 'listaAnosEditReceitaSelecao');
    sincronizarCheckboxesVisuaisEditReceita();
    editReceitaFoiModificada = true;
};

function atualizarBotoesAnosAtivos(ano, containerId) {
    document.querySelectorAll(`#${containerId} .btn-ano-opcao`).forEach(btn => {
        if(btn.innerText === ano) btn.classList.add('ativo');
        else btn.classList.remove('ativo');
    });
}

window.alternarTipoDespesaUI = function() {
    const tipo = document.getElementById('tipoDespesa').value;
    const containerSeletor = document.getElementById('containerSeletorMesDespesa');
    const infoBox = document.getElementById('infoIntervaloFixa');
    if (tipo === 'FixaAte') { containerSeletor.style.display = 'block'; if(infoBox) infoBox.style.display = 'block'; }
    else if (tipo === 'Variável') { containerSeletor.style.display = 'block'; if(infoBox) infoBox.style.display = 'none'; }
    else { containerSeletor.style.display = 'none'; if(infoBox) infoBox.style.display = 'none'; }
    limparSelecaoMesesCriacao();
};

window.alternarTipoDespesaEditUI = function() {
    const tipo = document.getElementById('editTipoDespesa').value;
    const containerSeletor = document.getElementById('containerEditSeletorMesDespesa');
    const infoBox = document.getElementById('infoIntervaloEditFixa');
    if (tipo === 'FixaAte' || tipo === 'Variável') {
        containerSeletor.style.display = 'block';
        if(infoBox) infoBox.style.display = tipo === 'FixaAte' ? 'block' : 'none';
    } else { containerSeletor.style.display = 'none'; }
};

window.alternarTipoReceitaUI = function() {
    const tipo = document.getElementById('tipoReceita').value;
    const containerSeletor = document.getElementById('containerSeletorMesReceita');
    const infoBox = document.getElementById('infoIntervaloFixaReceita');
    if (tipo === 'FixaAte' || tipo === 'Extra') {
        containerSeletor.style.display = 'block';
        if(infoBox) infoBox.style.display = tipo === 'FixaAte' ? 'block' : 'none';
    } else {
        containerSeletor.style.display = 'none';
        if(infoBox) infoBox.style.display = 'none';
        selecaoMesesReceitaMap = {}; selecaoMesesFixaInicio = null; selecaoMesesFixaFim = null;
        document.getElementById('textoMesesReceita').innerText = "Período / Meses...";
        document.querySelectorAll('#gradeMesesReceitaCriacao .chk-rec-mes').forEach(c => c.checked = false);
    }
};

window.alternarTipoReceitaEditUI = function() {
    const tipo = document.getElementById('editTipoReceita').value;
    const containerSeletor = document.getElementById('containerEditSeletorMesReceita');
    if (tipo === 'FixaAte' || tipo === 'Extra') containerSeletor.style.display = 'block';
    else { containerSeletor.style.display = 'none'; editMesesReceitaMap = {}; document.getElementById('textoMesesEditReceita').innerText = "Período / Meses..."; }
};

window.limparCamposFormularioDespesa = function() {
    document.getElementById('nomeDespesa').value = '';
    document.getElementById('valorDespesa').value = '';
    document.getElementById('tipoDespesa').value = 'Fixa';
    alternarTipoDespesaUI();
};

window.limparCamposFormularioReceita = function() {
    document.getElementById('nomeReceita').value = '';
    document.getElementById('valorReceita').value = '';
    document.getElementById('tipoReceita').value = 'Fixa';
    alternarTipoReceitaUI();
};

function limparSelecaoMesesCriacao() {
    selecaoMesesFixaInicio = null; selecaoMesesFixaFim = null; selecaoMesesVariavelMap = {};
    document.querySelectorAll('#gradeMesesCriacao .chk-mes').forEach(chk => chk.checked = false);
    document.getElementById('textoMeses').innerText = "Período / Meses...";
}

window.zerarPeriodoEdicaoDesp = function() {
    editDespesaFoiModificada = true; editMesesFixaInicio = null; editMesesFixaFim = null; editMesesVariavelMap = {};
    document.querySelectorAll('#gradeMesesEditCriacao .chk-edit-mes').forEach(chk => chk.checked = false);
    document.getElementById('textoMesesEdit').innerText = "Período / Meses...";
};

window.zerarPeriodoEdicaoRec = function() {
    editReceitaFoiModificada = true; editMesesReceitaMap = {};
    document.querySelectorAll('#gradeMesesEditReceitaCriacao .chk-edit-rec-mes').forEach(chk => chk.checked = false);
    document.getElementById('textoMesesEditReceita').innerText = "Mês / Ano da Receita...";
};

window.processarSelecaoMes = function(mesValor, event) {
    const tipo = document.getElementById('tipoDespesa').value;
    const mesIndex = mesesOrdem.indexOf(mesValor);
    const anoAtualSel = parseInt(anoSelecionadoCriacao);

    if (tipo === 'Variável') {
        if (!selecaoMesesVariavelMap[anoAtualSel]) selecaoMesesVariavelMap[anoAtualSel] = [];
        const chk = document.getElementById(`chk-${mesValor}`);
        if (chk.checked) {
            if (!selecaoMesesVariavelMap[anoAtualSel].includes(mesValor)) selecaoMesesVariavelMap[anoAtualSel].push(mesValor);
        } else {
            selecaoMesesVariavelMap[anoAtualSel] = selecaoMesesVariavelMap[anoAtualSel].filter(m => m !== mesValor);
            if (selecaoMesesVariavelMap[anoAtualSel].length === 0) delete selecaoMesesVariavelMap[anoAtualSel];
        }
        atualizarTextoMesesVariavel();
        return;
    }

    if (tipo === 'FixaAte') {
        if (!selecaoMesesFixaInicio) {
            selecaoMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
            selecaoMesesFixaFim = null;
            document.getElementById('textoMeses').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
        } else if (!selecaoMesesFixaFim) {
            let candidatoFim = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
            let inicioAbs = selecaoMesesFixaInicio.ano * 12 + selecaoMesesFixaInicio.mesIndex;
            let fimAbs = candidatoFim.ano * 12 + candidatoFim.mesIndex;
            if (fimAbs < inicioAbs) {
                selecaoMesesFixaInicio = candidatoFim;
                document.getElementById('textoMeses').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
            } else {
                selecaoMesesFixaFim = candidatoFim;
                document.getElementById('textoMeses').innerText = `${(fimAbs - inicioAbs) + 1} meses (${selecaoMesesFixaFixaFormatado()})`;
            }
        } else {
            selecaoMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
            selecaoMesesFixaFim = null;
            document.getElementById('textoMeses').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
        }
        sincronizarCheckboxesVisuaisCriacao();
    }
};

window.processarSelecaoMesEdit = function(mesValor, event) {
    editDespesaFoiModificada = true;
    const tipo = document.getElementById('editTipoDespesa').value;
    const mesIndex = mesesOrdem.indexOf(mesValor);
    const anoAtualSel = parseInt(anoEditandoDespesaAnoSel);

    if (tipo === 'Variável') {
        if (!editMesesVariavelMap[anoAtualSel]) editMesesVariavelMap[anoAtualSel] = [];
        const chk = document.getElementById(`chkEdit-${mesValor}`);
        if (chk.checked) {
            if (!editMesesVariavelMap[anoAtualSel].includes(mesValor)) editMesesVariavelMap[anoAtualSel].push(mesValor);
        } else {
            editMesesVariavelMap[anoAtualSel] = editMesesVariavelMap[anoAtualSel].filter(m => m !== mesValor);
            if (editMesesVariavelMap[anoAtualSel].length === 0) delete editMesesVariavelMap[anoAtualSel];
        }
        atualizarTextoMesesEditVariavel();
        return;
    }

    if (!editMesesFixaInicio) {
        editMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
        editMesesFixaFim = null;
        document.getElementById('textoMesesEdit').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
    } else if (!editMesesFixaFim) {
        let candidatoFim = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
        let inicioAbs = editMesesFixaInicio.ano * 12 + editMesesFixaInicio.mesIndex;
        let fimAbs = candidatoFim.ano * 12 + candidatoFim.mesIndex;
        if (fimAbs < inicioAbs) {
            editMesesFixaInicio = candidatoFim;
            document.getElementById('textoMesesEdit').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
        } else {
            editMesesFixaFim = candidatoFim;
            document.getElementById('textoMesesEdit').innerText = `${(fimAbs - inicioAbs) + 1} meses (${editMesesFixaFixaFormatado()})`;
        }
    } else {
        editMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
        editMesesFixaFim = null;
        document.getElementById('textoMesesEdit').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
    }
    sincronizarCheckboxesVisuaisEditDespesa();
};

window.processarSelecaoMesReceita = function(mesValor, event) {
    const tipo = document.getElementById('tipoReceita').value;
    const mesIndex = mesesOrdem.indexOf(mesValor);
    const anoAtualSel = parseInt(anoSelecionadoCriacaoReceita);

    if (tipo === 'Extra') {
        if (!selecaoMesesReceitaMap[anoAtualSel]) selecaoMesesReceitaMap[anoAtualSel] = [];
        const chk = document.getElementById(`chkRec-${mesValor}`);
        if (chk.checked) {
            if (!selecaoMesesReceitaMap[anoAtualSel].includes(mesValor)) selecaoMesesReceitaMap[anoAtualSel].push(mesValor);
        } else {
            selecaoMesesReceitaMap[anoAtualSel] = selecaoMesesReceitaMap[anoAtualSel].filter(m => m !== mesValor);
            if (selecaoMesesReceitaMap[anoAtualSel].length === 0) delete selecaoMesesReceitaMap[anoAtualSel];
        }
        atualizarTextoMesesReceita();
        return;
    }

    if (tipo === 'FixaAte') {
        if (!selecaoMesesFixaInicio) {
            selecaoMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
            selecaoMesesFixaFim = null;
            document.getElementById('textoMesesReceita').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
        } else if (!selecaoMesesFixaFim) {
            let candidatoFim = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
            let inicioAbs = selecaoMesesFixaInicio.ano * 12 + selecaoMesesFixaInicio.mesIndex;
            let fimAbs = candidatoFim.ano * 12 + candidatoFim.mesIndex;
            if (fimAbs < inicioAbs) {
                selecaoMesesFixaInicio = candidatoFim;
                document.getElementById('textoMesesReceita').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
            } else {
                selecaoMesesFixaFim = candidatoFim;
                document.getElementById('textoMesesReceita').innerText = `${(fimAbs - inicioAbs) + 1} meses (${selecaoMesesFixaFixaFormatado()})`;
            }
        } else {
            selecaoMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesIndex, mesNome: mesValor };
            selecaoMesesFixaFim = null;
            document.getElementById('textoMesesReceita').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
        }
        sincronizarCheckboxesVisuaisCriacaoReceitaFixaAte();
    }
};

window.processarSelecaoMesEditReceita = function(mesValor, event) {
    editReceitaFoiModificada = true;
    const tipo = document.getElementById('editTipoReceita').value;
    const anoAtualSel = parseInt(anoEditandoReceitaAnoSel);

    if (tipo === 'Extra') {
        if (!editMesesReceitaMap[anoAtualSel]) editMesesReceitaMap[anoAtualSel] = [];
        const chk = document.getElementById(`chkEditRec-${mesValor}`);
        if (chk.checked) {
            if (!editMesesReceitaMap[anoAtualSel].includes(mesValor)) editMesesReceitaMap[anoAtualSel].push(mesValor);
        } else {
            editMesesReceitaMap[anoAtualSel] = editMesesReceitaMap[anoAtualSel].filter(m => m !== mesValor);
            if (editMesesReceitaMap[anoAtualSel].length === 0) delete editMesesReceitaMap[anoAtualSel];
        }
        atualizarTextoMesesEditReceita();
        return;
    }

    if (!editMesesFixaInicio) {
        editMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesesOrdem.indexOf(mesValor), mesNome: mesValor };
        editMesesFixaFim = null;
        document.getElementById('textoMesesEditReceita').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
    } else if (!editMesesFixaFim) {
        let candidatoFim = { ano: anoAtualSel, mesIndex: mesesOrdem.indexOf(mesValor), mesNome: mesValor };
        let inicioAbs = editMesesFixaInicio.ano * 12 + editMesesFixaInicio.mesIndex;
        let fimAbs = candidatoFim.ano * 12 + candidatoFim.mesIndex;
        if (fimAbs < inicioAbs) {
            editMesesFixaInicio = candidatoFim;
            document.getElementById('textoMesesEditReceita').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
        } else {
            editMesesFixaFim = candidatoFim;
            document.getElementById('textoMesesEditReceita').innerText = `${(fimAbs - inicioAbs) + 1} meses (${editMesesFixaFixaFormatado()})`;
        }
    } else {
        editMesesFixaInicio = { ano: anoAtualSel, mesIndex: mesesOrdem.indexOf(mesValor), mesNome: mesValor };
        editMesesFixaFim = null;
        document.getElementById('textoMesesEditReceita').innerText = `Início: ${mesValor}/${anoAtualSel} (Escolha o fim)`;
    }
};

function selecaoMesesFixaFixaFormatado() {
    if (!selecaoMesesFixaInicio || !selecaoMesesFixaFim) return '';
    return `${selecaoMesesFixaInicio.mesNome}/${selecaoMesesFixaInicio.ano} a ${selecaoMesesFixaFim.mesNome}/${selecaoMesesFixaFim.ano}`;
}

function editMesesFixaFixaFormatado() {
    if (!editMesesFixaInicio || !editMesesFixaFim) return '';
    return `${editMesesFixaInicio.mesNome}/${editMesesFixaInicio.ano} a ${editMesesFixaFim.mesNome}/${editMesesFixaFim.ano}`;
}

function sincronizarCheckboxesVisuaisCriacaoReceitaFixaAte() {
    const anoAtualSel = parseInt(anoSelecionadoCriacaoReceita);
    document.querySelectorAll('#gradeMesesReceitaCriacao .chk-rec-mes').forEach(chk => {
        const mesVal = chk.value;
        const mIndex = mesesOrdem.indexOf(mesVal);
        if (!selecaoMesesFixaInicio) { chk.checked = false; return; }
        let atualAbs = anoAtualSel * 12 + mIndex;
        let inicioAbs = selecaoMesesFixaInicio.ano * 12 + selecaoMesesFixaInicio.mesIndex;
        let fimAbs = selecaoMesesFixaFim ? (selecaoMesesFixaFim.ano * 12 + selecaoMesesFixaFim.mesIndex) : inicioAbs;
        chk.checked = (atualAbs >= inicioAbs && atualAbs <= fimAbs);
    });
}

function sincronizarCheckboxesVisuaisCriacao() {
    const tipo = document.getElementById('tipoDespesa').value;
    const anoAtualSel = parseInt(anoSelecionadoCriacao);
    document.querySelectorAll('#gradeMesesCriacao .chk-mes').forEach(chk => {
        const mesVal = chk.value;
        const mIndex = mesesOrdem.indexOf(mesVal);
        if (tipo === 'Variável') {
            chk.checked = (selecaoMesesVariavelMap[anoAtualSel] || []).includes(mesVal);
            return;
        }
        if (!selecaoMesesFixaInicio) { chk.checked = false; return; }
        let atualAbs = anoAtualSel * 12 + mIndex;
        let inicioAbs = selecaoMesesFixaInicio.ano * 12 + selecaoMesesFixaInicio.mesIndex;
        let fimAbs = selecaoMesesFixaFim ? (selecaoMesesFixaFim.ano * 12 + selecaoMesesFixaFim.mesIndex) : inicioAbs;
        chk.checked = (atualAbs >= inicioAbs && atualAbs <= fimAbs);
    });
}

function sincronizarCheckboxesVisuaisEditDespesa() {
    const tipo = document.getElementById('editTipoDespesa').value;
    const anoAtualSel = parseInt(anoEditandoDespesaAnoSel);
    document.querySelectorAll('#gradeMesesEditCriacao .chk-edit-mes').forEach(chk => {
        const mesVal = chk.value;
        const mIndex = mesesOrdem.indexOf(mesVal);
        if (tipo === 'Variável') {
            chk.checked = (editMesesVariavelMap[anoAtualSel] || []).includes(mesVal);
            return;
        }
        if (!editMesesFixaInicio) { chk.checked = false; return; }
        let atualAbs = anoAtualSel * 12 + mIndex;
        let inicioAbs = editMesesFixaInicio.ano * 12 + editMesesFixaInicio.mesIndex;
        let fimAbs = editMesesFixaFim ? (editMesesFixaFim.ano * 12 + editMesesFixaFim.mesIndex) : inicioAbs;
        chk.checked = (atualAbs >= inicioAbs && atualAbs <= fimAbs);
    });
}

function sincronizarCheckboxesVisuaisCriacaoReceita() {
    const tipo = document.getElementById('tipoReceita').value;
    const anoAtualSel = parseInt(anoSelecionadoCriacaoReceita);
    document.querySelectorAll('#gradeMesesReceitaCriacao .chk-rec-mes').forEach(chk => {
        const mesVal = chk.value;
        if (tipo === 'Extra') {
            chk.checked = (selecaoMesesReceitaMap[anoAtualSel] || []).includes(mesVal);
        }
    });
}

function sincronizarCheckboxesVisuaisEditReceita() {
    const tipo = document.getElementById('editTipoReceita').value;
    const anoAtualSel = parseInt(anoEditandoReceitaAnoSel);
    document.querySelectorAll('#gradeMesesEditReceitaCriacao .chk-edit-rec-mes').forEach(chk => {
        const mesVal = chk.value;
        if (tipo === 'Extra') {
            chk.checked = (editMesesReceitaMap[anoAtualSel] || []).includes(mesVal);
        }
    });
}

function atualizarTextoMesesVariavel() {
    let totalGeral = 0, primeiroMesEncontrado = null;
    Object.keys(selecaoMesesVariavelMap).map(Number).sort((a,b) => a - b).forEach(a => {
        let ms = selecaoMesesVariavelMap[a];
        if (ms && ms.length > 0) {
            totalGeral += ms.length;
            if (!primeiroMesEncontrado) { ms.sort((x, y) => mesesOrdem.indexOf(x) - mesesOrdem.indexOf(y)); primeiroMesEncontrado = `${ms[0]}/${a}`; }
        }
    });
    let span = document.getElementById('textoMeses');
    if (totalGeral === 0) span.innerText = "Período / Meses...";
    else if (totalGeral === 1) span.innerText = primeiroMesEncontrado;
    else span.innerText = `${primeiroMesEncontrado} + ${totalGeral - 1} mês(es)`;
}

function atualizarTextoMesesEditVariavel() {
    let totalGeral = 0, primeiroMesEncontrado = null;
    Object.keys(editMesesVariavelMap).map(Number).sort((a,b) => a - b).forEach(a => {
        let ms = editMesesVariavelMap[a];
        if (ms && ms.length > 0) {
            totalGeral += ms.length;
            if (!primeiroMesEncontrado) { ms.sort((x, y) => mesesOrdem.indexOf(x) - mesesOrdem.indexOf(y)); primeiroMesEncontrado = `${ms[0]}/${a}`; }
        }
    });
    let span = document.getElementById('textoMesesEdit');
    if (totalGeral === 0) span.innerText = "Período / Meses...";
    else if (totalGeral === 1) span.innerText = primeiroMesEncontrado;
    else span.innerText = `${primeiroMesEncontrado} + ${totalGeral - 1} mês(es)`;
}

function atualizarTextoMesesReceita() {
    let totalGeral = 0, primeiroMesEncontrado = null;
    Object.keys(selecaoMesesReceitaMap).map(Number).sort((a,b) => a - b).forEach(a => {
        let ms = selecaoMesesReceitaMap[a];
        if (ms && ms.length > 0) {
            totalGeral += ms.length;
            if (!primeiroMesEncontrado) { ms.sort((x, y) => mesesOrdem.indexOf(x) - mesesOrdem.indexOf(y)); primeiroMesEncontrado = `${ms[0]}/${a}`; }
        }
    });
    let span = document.getElementById('textoMesesReceita');
    if (totalGeral === 0) span.innerText = "Período / Meses...";
    else if (totalGeral === 1) span.innerText = primeiroMesEncontrado;
    else span.innerText = `${primeiroMesEncontrado} + ${totalGeral - 1} mês(es)`;
}

function atualizarTextoMesesEditReceita() {
    let totalGeral = 0, primeiroMesEncontrado = null;
    Object.keys(editMesesReceitaMap).map(Number).sort((a,b) => a - b).forEach(a => {
        let ms = editMesesReceitaMap[a];
        if (ms && ms.length > 0) {
            totalGeral += ms.length;
            if (!primeiroMesEncontrado) { ms.sort((x, y) => mesesOrdem.indexOf(x) - mesesOrdem.indexOf(y)); primeiroMesEncontrado = `${ms[0]}/${a}`; }
        }
    });
    let span = document.getElementById('textoMesesEditReceita');
    if (totalGeral === 0) span.innerText = "Período / Meses...";
    else if (totalGeral === 1) span.innerText = primeiroMesEncontrado;
    else span.innerText = `${primeiroMesEncontrado} + ${totalGeral - 1} mês(es)`;
}

window.marcarModificadoEdicaoDesp = function() { editDespesaFoiModificada = true; };
window.marcarModificadoEdicaoRec = function() { editReceitaFoiModificada = true; };

window.abrirModalEditarDespesa = function(index) {
    indexEditandoDespesa = index; editDespesaFoiModificada = false; tipoModalEmEdicaoAtual = 'despesa';
    let desp = dadosLocais.despesas[index];
    document.getElementById('editNomeDespesa').value = desp.nome;
    document.getElementById('editValorDespesa').value = desp.valor;
    let tipoD = desp.tipo || 'Fixa';
    document.getElementById('editTipoDespesa').value = tipoD;

    if (tipoD === 'FixaAte' && desp.intervaloCompleto) {
        editMesesFixaInicio = desp.intervaloCompleto.inicio;
        editMesesFixaFim = desp.intervaloCompleto.fim;
        anoEditandoDespesaAnoSel = editMesesFixaInicio.ano.toString();
        document.getElementById('textoMesesEdit').innerText = `${desp.totalMesesContrato} meses (${editMesesFixaFixaFormatado()})`;
        editMesesVariavelMap = {};
    } else if (tipoD === 'Variável' && desp.mesesPorAno) {
        editMesesVariavelMap = JSON.parse(JSON.stringify(desp.mesesPorAno));
        editMesesFixaInicio = null; editMesesFixaFim = null;
        anoEditandoDespesaAnoSel = Object.keys(editMesesVariavelMap)[0] || new Date().getFullYear().toString();
        atualizarTextoMesesEditVariavel();
    } else {
        editMesesFixaInicio = null; editMesesFixaFim = null; editMesesVariavelMap = {};
        document.getElementById('textoMesesEdit').innerText = "Período / Meses...";
    }
    document.getElementById('txtAnoSelecionadoEdit').innerText = anoEditandoDespesaAnoSel;
    atualizarBotoesAnosAtivos(anoEditandoDespesaAnoSel, 'listaAnosEditSelecao');
    alternarTipoDespesaEditUI();
    document.getElementById('modalEditarDespesa').style.display = 'flex';
};

window.tentarFecharModalEdicaoDespesa = function() {
    if (editDespesaFoiModificada) document.getElementById('modalConfirmarSaidaEdicao').style.display = 'flex';
    else fecharModalEditarDespesa();
};

window.fecharModalEditarDespesa = function() {
    document.getElementById('modalEditarDespesa').style.display = 'none';
    document.getElementById('opcoesMesesEdit').style.display = 'none';
    indexEditandoDespesa = -1; editDespesaFoiModificada = false;
};

window.salvarEdicaoDespesa = async function() {
    if (indexEditandoDespesa === -1) return;
    let nome = document.getElementById('editNomeDespesa').value.trim();
    let valor = parseFloat(document.getElementById('editValorDespesa').value);
    let tipo = document.getElementById('editTipoDespesa').value;
    if (!nome || isNaN(valor) || valor <= 0) { alert('Preencha nome e valor válidos.'); return; }

    let desp = dadosLocais.despesas[indexEditandoDespesa];
    desp.nome = nome; desp.valor = valor; desp.tipo = tipo;

    if (tipo === 'FixaAte') {
        if (!editMesesFixaInicio || !editMesesFixaFim) { alert('Selecione o período completo.'); return; }
        let inicioAbs = editMesesFixaInicio.ano * 12 + editMesesFixaInicio.mesIndex;
        let fimAbs = editMesesFixaFim.ano * 12 + editMesesFixaFim.mesIndex;
        let totalMeses = (fimAbs - inicioAbs) + 1;
        desp.intervaloCompleto = { inicio: editMesesFixaInicio, fim: editMesesFixaFim };
        desp.totalMesesContrato = totalMeses; desp.parcelas = totalMeses;
        delete desp.mesesPorAno;
    } else if (tipo === 'Variável') {
        let totalMesesVar = 0;
        Object.keys(editMesesVariavelMap).forEach(a => { if (editMesesVariavelMap[a]) totalMesesVar += editMesesVariavelMap[a].length; });
        if (totalMesesVar === 0) { alert('Selecione pelo menos um mês.'); return; }
        desp.mesesPorAno = JSON.parse(JSON.stringify(editMesesVariavelMap));
        desp.totalMesesContrato = totalMesesVar; desp.parcelas = totalMesesVar;
        delete desp.intervaloCompleto;
    } else { delete desp.intervaloCompleto; delete desp.mesesPorAno; }

    fecharModalEditarDespesa();
    await salvarNaNuvem();
};

window.abrirModalEditarReceita = function(index) {
    indexEditandoReceita = index; editReceitaFoiModificada = false; tipoModalEmEdicaoAtual = 'receita';
    let rec = dadosLocais.receitas[index];
    document.getElementById('editNomeReceita').value = rec.nome;
    document.getElementById('editValorReceita').value = rec.valor;
    let tipoR = rec.tipo || 'Fixa';
    document.getElementById('editTipoReceita').value = tipoR;

    if (tipoR === 'FixaAte' && rec.intervaloCompleto) {
        editMesesFixaInicio = rec.intervaloCompleto.inicio; editMesesFixaFim = rec.intervaloCompleto.fim;
        anoEditandoReceitaAnoSel = editMesesFixaInicio.ano.toString();
        document.getElementById('textoMesesEditReceita').innerText = `${rec.totalMesesContrato} meses (${editMesesFixaFixaFormatado()})`;
        editMesesReceitaMap = {};
    } else if (tipoR === 'Extra' && rec.mesesPorAno) {
        editMesesReceitaMap = JSON.parse(JSON.stringify(rec.mesesPorAno));
        anoEditandoReceitaAnoSel = Object.keys(editMesesReceitaMap)[0] || new Date().getFullYear().toString();
        atualizarTextoMesesEditReceita();
    } else {
        editMesesReceitaMap = {}; anoEditandoReceitaAnoSel = new Date().getFullYear().toString();
        document.getElementById('textoMesesEditReceita').innerText = "Período / Meses...";
    }
    document.getElementById('txtAnoSelecionadoEditReceita').innerText = anoEditandoReceitaAnoSel;
    atualizarBotoesAnosAtivos(anoEditandoReceitaAnoSel, 'listaAnosEditReceitaSelecao');
    alternarTipoReceitaEditUI();
    document.getElementById('modalEditarReceita').style.display = 'flex';
};

window.tentarFecharModalEdicaoReceita = function() {
    if (editReceitaFoiModificada) document.getElementById('modalConfirmarSaidaEdicao').style.display = 'flex';
    else fecharModalEditarReceita();
};

window.fecharModalEditarReceita = function() {
    document.getElementById('modalEditarReceita').style.display = 'none';
    document.getElementById('opcoesMesesEditReceita').style.display = 'none';
    indexEditandoReceita = -1; editReceitaFoiModificada = false;
};

window.salvarEdicaoReceita = async function() {
    if (indexEditandoReceita === -1) return;
    let nome = document.getElementById('editNomeReceita').value.trim();
    let valor = parseFloat(document.getElementById('editValorReceita').value);
    let tipo = document.getElementById('editTipoReceita').value;
    if (!nome || isNaN(valor) || valor <= 0) { alert('Preencha nome e valor válidos.'); return; }

    let rec = dadosLocais.receitas[indexEditandoReceita];
    rec.nome = nome; rec.valor = valor; rec.tipo = tipo;

    if (tipo === 'FixaAte') {
        if (!editMesesFixaInicio || !editMesesFixaFim) { alert('Selecione o período completo.'); return; }
        let inicioAbs = editMesesFixaInicio.ano * 12 + editMesesFixaInicio.mesIndex;
        let fimAbs = editMesesFixaFim.ano * 12 + editMesesFixaFim.mesIndex;
        rec.intervaloCompleto = { inicio: editMesesFixaInicio, fim: editMesesFixaFim };
        rec.totalMesesContrato = (fimAbs - inicioAbs) + 1;
        delete rec.mesesPorAno;
    } else if (tipo === 'Extra') {
        let totalM = 0;
        Object.keys(editMesesReceitaMap).forEach(a => { if (editMesesReceitaMap[a]) totalM += editMesesReceitaMap[a].length; });
        if (totalM === 0) { alert('Selecione pelo menos um mês.'); return; }
        rec.mesesPorAno = JSON.parse(JSON.stringify(editMesesReceitaMap));
        delete rec.intervaloCompleto;
    } else { delete rec.mesesPorAno; delete rec.intervaloCompleto; }

    fecharModalEditarReceita();
    await salvarNaNuvem();
};

window.acaoConfirmarSaidaEdicao = function(salvar) {
    document.getElementById('modalConfirmarSaidaEdicao').style.display = 'none';
    if (salvar) {
        if (tipoModalEmEdicaoAtual === 'despesa') salvarEdicaoDespesa();
        else if (tipoModalEmEdicaoAtual === 'receita') salvarEdicaoReceita();
    } else {
        if (tipoModalEmEdicaoAtual === 'despesa') fecharModalEditarDespesa();
        else if (tipoModalEmEdicaoAtual === 'receita') fecharModalEditarReceita();
    }
};

window.salvarConfiguracoes = async function() {
    const selTema = document.getElementById('selectTema').value;
    const selFonte = document.getElementById('selectFonte').value;
    let nomeTemaDesc = selTema === 'escuro' ? "Modo Escuro" : (selTema === 'margaridas' ? "Rosa com Margaridas" : "Modo Claro");
    let tornarPadrao = confirm(`Deseja tornar o "${nomeTemaDesc}" o tema padrão da sua conta para qualquer aparelho?`);

    localStorage.setItem('temaSolon', selTema);
    localStorage.setItem('fonteSolon', selFonte);
    aplicarTemaVisual(selTema);
    document.body.style.fontFamily = selFonte;

    if (currentUserUid) {
        try {
            let dadosAtualizacao = { fontePadrao: selFonte };
            if (tornarPadrao) dadosAtualizacao.temaPadrao = selTema;
            if (fotoBase64Temporaria) dadosAtualizacao.fotoPerfil = fotoBase64Temporaria;
            await setDoc(doc(db, "usuarios", currentUserUid), dadosAtualizacao, { merge: true });
            atualizarRotulosTemaPadrao(selTema, tornarPadrao ? selTema : null);
        } catch (error) { console.error("Erro:", error); }
    }
    alert("Configurações salvas com sucesso!");
};

window.salvarDadosPessoaisConfig = async function() {
    const novoNome = document.getElementById('configEditNome').value.trim();
    const novoSobrenome = document.getElementById('configEditSobrenome').value.trim();
    const novoApelido = document.getElementById('configEditApelido').value.trim();
    if (!novoNome || !novoSobrenome) { alert("Nome e Sobrenome não podem ficar vazios."); return; }

    if (currentUserUid) {
        try {
            await setDoc(doc(db, "usuarios", currentUserUid), { nome: novoNome, sobrenome: novoSobrenome, apelido: novoApelido }, { merge: true });
            let nomeExibicao = novoApelido || novoNome;
            document.getElementById('nomeUserDisplay').innerText = nomeExibicao;
            document.getElementById('frasePersonalizada').innerText = `Não gasta com besteira ${nomeExibicao}, kkk`;
            alert("Dados pessoais atualizados com sucesso!");
        } catch (error) { alert("Erro: " + error.message); }
    }
};

function atualizarRotulosTemaPadrao(temaAtual, temaPadraoNuvem) {
    const optClaro = document.getElementById('optTemaClaro');
    const optEscuro = document.getElementById('optTemaEscuro');
    const optMargaridas = document.getElementById('optTemaMargaridas');
    if(optClaro) optClaro.innerText = "Modo Claro";
    if(optEscuro) optEscuro.innerText = "Modo Escuro";
    if(optMargaridas) optMargaridas.innerText = "🌸 Rosa com Margaridas";

    if (temaPadraoNuvem === 'claro' && optClaro) optClaro.innerText = "Modo Claro (Padrão)";
    else if (temaPadraoNuvem === 'escuro' && optEscuro) optEscuro.innerText = "Modo Escuro (Padrão)";
    else if (temaPadraoNuvem === 'margaridas' && optMargaridas) optMargaridas.innerText = "🌸 Rosa com Margaridas (Padrão)";
}

window.adicionarMovimentoEconomia = async function() {
    let motivo = document.getElementById('motivoEconomia').value.trim();
    let valor = parseFloat(document.getElementById('valorEconomia').value);
    let tipo = document.getElementById('tipoMovimentoEconomia').value;
    if (!motivo || isNaN(valor) || valor <= 0) { alert('Preencha um motivo e um valor válido.'); return; }

    if (!dadosLocais.economia) dadosLocais.economia = [];
    dadosLocais.economia.push({
        motivo: motivo, valor: tipo === 'Saque' ? -Math.abs(valor) : Math.abs(valor),
        tipo: tipo, data: new Date().toLocaleDateString('pt-BR')
    });
    document.getElementById('motivoEconomia').value = '';
    document.getElementById('valorEconomia').value = '';
    await salvarNaNuvem(); renderizarEconomia();
};

window.solicitarRemocaoMovimentoEconomia = function(index) {
    funcaoExclusaoCallback = async () => { dadosLocais.economia.splice(index, 1); await salvarNaNuvem(); renderizarEconomia(); };
    document.getElementById('txtMensagemConfirmacaoExclusao').innerText = "Deseja realmente apagar esta movimentação?";
    document.getElementById('modalConfirmarExclusaoUniversal').style.display = 'flex';
};

window.solicitarRemocaoReceita = function(index) {
    funcaoExclusaoCallback = async () => {
        dadosLocais.receitas.splice(index, 1); await salvarNaNuvem(); renderizarReceitas();
        if (document.getElementById('btnSubMensal').classList.contains('ativo')) atualizarAnaliseMes();
    };
    document.getElementById('txtMensagemConfirmacaoExclusao').innerText = "Deseja realmente apagar esta receita?";
    document.getElementById('modalConfirmarExclusaoUniversal').style.display = 'flex';
};

window.solicitarRemocaoDespesa = function(index) {
    funcaoExclusaoCallback = async () => {
        dadosLocais.despesas.splice(index, 1); await salvarNaNuvem(); renderizarDespesas();
        if (document.getElementById('btnSubMensal').classList.contains('ativo')) atualizarAnaliseMes();
    };
    document.getElementById('txtMensagemConfirmacaoExclusao').innerText = "Deseja realmente apagar esta despesa?";
    document.getElementById('modalConfirmarExclusaoUniversal').style.display = 'flex';
};

window.solicitarRemocaoItemAnotacao = function(index) {
    funcaoExclusaoCallback = async () => { dadosLocais.itens.splice(index, 1); await salvarNaNuvem(); atualizarTelaHTML(); };
    document.getElementById('txtMensagemConfirmacaoExclusao').innerText = "Deseja realmente apagar esta anotação?";
    document.getElementById('modalConfirmarExclusaoUniversal').style.display = 'flex';
};

window.executarExclusaoConfirmada = async function() {
    let cb = funcaoExclusaoCallback;
    document.getElementById('modalConfirmarExclusaoUniversal').style.display = 'none';
    funcaoExclusaoCallback = null;
    if (cb) await cb();
};

window.fecharModalConfirmarExclusao = function() {
    document.getElementById('modalConfirmarExclusaoUniversal').style.display = 'none';
    funcaoExclusaoCallback = null;
};

function renderizarEconomia() {
    const listaHtml = document.getElementById('lista-economia-html');
    const dashValor = document.getElementById('dash-valor-economia');
    if(!listaHtml) return;
    listaHtml.innerHTML = '';
    let total = 0;

    if (!dadosLocais.economia || dadosLocais.economia.length === 0) {
        listaHtml.innerHTML = '<li style="color: #777; justify-content: center;">Nenhuma economia registrada ainda.</li>';
        dashValor.innerText = "R$ 0,00"; return;
    }

    dadosLocais.economia.forEach(function(item, index) {
        total += item.valor;
        let valFormat = Math.abs(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="info-financa">
                <span class="nome">${item.motivo} (${item.tipo})</span>
                <span class="detalhes">Data: ${item.data || 'Recente'}</span>
                <span class="${item.valor >= 0 ? 'valor-receita' : 'valor-despesa'}">${item.valor >= 0 ? '+' : '-'} ${valFormat}</span>
            </div>
            <div class="botoes-acao"><button class="btn-lixeira" onclick="solicitarRemocaoMovimentoEconomia(${index})">🗑️</button></div>
        `;
        listaHtml.appendChild(li);
    });
    dashValor.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

window.mudarSubAba = function(tipo) {
    document.getElementById('btnSubMensal').classList.remove('ativo');
    document.getElementById('btnSubAnual').classList.remove('ativo');
    document.getElementById('painelSubMensal').classList.remove('ativo');
    document.getElementById('painelSubAnual').classList.remove('ativo');

    if(tipo === 'mensal') {
        document.getElementById('btnSubMensal').classList.add('ativo');
        document.getElementById('painelSubMensal').classList.add('ativo');
        document.getElementById('tituloExtratoPainel').innerText = "Extrato de Despesas";
        atualizarAnaliseMes();
    } else {
        document.getElementById('btnSubAnual').classList.add('ativo');
        document.getElementById('painelSubAnual').classList.add('ativo');
        document.getElementById('tituloExtratoPainel').innerText = "Extrato Anual";
        zerarPainelLateralAnual();
    }
};

function zerarPainelLateralAnual() {
    document.getElementById('listaExtratoMes').innerHTML = '<li style="color: #777; text-align: center; padding: 10px; font-size: 13px;">Nenhum dado exibido na visão anual.</li>';
    document.getElementById('analiseReceita').innerText = "R$ 0,00";
    document.getElementById('analiseDespesa').innerText = "R$ 0,00";
    document.getElementById('analisePago').innerText = "R$ 0,00";
    document.getElementById('analiseAPagar').innerText = "R$ 0,00";
    document.getElementById('analiseDisponivel').innerText = "R$ 0,00";
    let elSaldo = document.getElementById('analiseSaldo');
    elSaldo.innerText = "R$ 0,00"; elSaldo.className = "cor-saldo";
    document.getElementById('barraRecFill').style.width = '50%';
    document.getElementById('barraDespFill').style.width = '50%';
    document.getElementById('txtLegendaBarra').innerText = "Visão Anual";
    document.getElementById('graficoCirculo').style.background = `conic-gradient(#e9ecef 0% 100%)`;
    document.getElementById('txtCirculoPorc').innerText = "0%";
    let badge = document.getElementById('badgeStatus');
    badge.innerText = "AJUSTES"; badge.style.backgroundColor = "#6c757d"; badge.style.color = "white";
    document.getElementById('txtDescStatus').innerText = "Painel anual";
}

window.trocarPainelAuth = function(painel) {
    document.querySelectorAll('.painel-auth').forEach(p => p.classList.remove('ativo'));
    document.getElementById('painel-' + painel).classList.add('ativo');
    document.querySelectorAll('.msg-aviso').forEach(msg => { msg.style.display = 'none'; msg.innerText = ''; });
};

window.fazerLogin = function() {
    const email = document.getElementById('emailLogin').value;
    const senha = document.getElementById('senhaLogin').value;
    const msgErro = document.getElementById('msgErroLogin');
    if (!email || !senha) { msgErro.innerText = "Preencha todos os campos!"; msgErro.style.display = 'block'; return; }
    signInWithEmailAndPassword(auth, email, senha)
        .then(() => { msgErro.style.display = 'none'; })
        .catch(() => { msgErro.innerText = "E-mail ou senha incorretos!"; msgErro.style.display = 'block'; });
};

window.processarFotoPerfil = function(input, origem) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let width = img.width, height = img.height;
                if (width > height) { if (width > 150) { height *= 150 / width; width = 150; } }
                else { if (height > 150) { width *= 150 / height; height = 150; } }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                fotoBase64Temporaria = canvas.toDataURL('image/jpeg', 0.8);
                
                if (origem === 'cadastro') {
                    document.getElementById('previewAvatar').src = fotoBase64Temporaria;
                    document.getElementById('previewAvatar').style.display = 'block';
                    document.getElementById('previewTexto').style.display = 'none';
                } else if (origem === 'config') {
                    document.getElementById('previewConfigAvatar').src = fotoBase64Temporaria;
                    document.getElementById('previewConfigAvatar').style.display = 'block';
                    document.getElementById('previewConfigPadrao').style.display = 'none';
                    document.getElementById('avatarLateral').src = fotoBase64Temporaria;
                    document.getElementById('avatarLateral').style.display = 'block';
                    document.getElementById('avatarLateralPadrao').style.display = 'none';
                }
            }
        }
        reader.readAsDataURL(input.files[0]);
    }
};

window.fazerCadastro = function() {
    const nome = document.getElementById('nomeCadastro').value.trim();
    const sobrenome = document.getElementById('sobrenomeCadastro').value.trim();
    const apelido = document.getElementById('apelidoCadastro').value.trim();
    const email = document.getElementById('emailCadastro').value.trim();
    const senha = document.getElementById('senhaCadastro').value;
    const confirma = document.getElementById('confirmaSenha').value;
    const msgErro = document.getElementById('msgErroCadastro');
    
    if (!nome || !sobrenome || !email || !senha || !confirma) { msgErro.innerText = "Preencha todos os campos obrigatórios!"; msgErro.style.display = 'block'; return; }
    if (senha !== confirma) { msgErro.innerText = "As senhas não coincidem!"; msgErro.style.display = 'block'; return; }
    if (senha.length < 6) { msgErro.innerText = "A senha deve ter pelo menos 6 caracteres."; msgErro.style.display = 'block'; return; }
    
    createUserWithEmailAndPassword(auth, email, senha)
        .then((userCredential) => {
            const user = userCredential.user;
            setDoc(doc(db, "usuarios", user.uid), {
                nome: nome, sobrenome: sobrenome, apelido: apelido || nome,
                email: email, fotoPerfil: fotoBase64Temporaria || "",
                temaPadrao: "claro", fontePadrao: "Arial, sans-serif"
            }).then(() => {
                setDoc(doc(db, "financeiro", user.uid), { itens: [], receitas: [], despesas: [], economia: [] }).then(() => {
                    alert("Conta criada com sucesso!"); fotoBase64Temporaria = ""; 
                });
            });
        })
        .catch((error) => {
            msgErro.innerText = error.code === 'auth/email-already-in-use' ? "Este e-mail já está cadastrado!" : "Erro ao criar conta.";
            msgErro.style.display = 'block';
        });
};

window.recuperarSenha = function() {
    const email = document.getElementById('emailRecuperacao').value;
    const msgRec = document.getElementById('msgRecuperacao');
    if (!email) { msgRec.innerText = "Por favor, digite seu e-mail."; msgRec.style.color = "#dc3545"; msgRec.style.display = 'block'; return; }
    sendPasswordResetEmail(auth, email)
        .then(() => { msgRec.innerText = "E-mail de recuperação enviado!"; msgRec.style.color = "#28a745"; msgRec.style.display = 'block'; })
        .catch(() => { msgRec.innerText = "E-mail não encontrado ou inválido."; msgRec.style.color = "#dc3545"; msgRec.style.display = 'block'; });
};

window.fazerLogout = function() {
    const modal = document.getElementById('modalConfirmarLogout');
    if (modal) {
        modal.style.display = 'flex';
    }
};

window.acaoConfirmarLogout = function(sair) {
    const modal = document.getElementById('modalConfirmarLogout');
    if (modal) {
        modal.style.display = 'none';
    }

    if (sair) {
        signOut(auth).then(() => {
            if (unsubscribeFirestore) unsubscribeFirestore();
            currentUserUid = null; 
            dadosLocais = { itens: [], receitas: [], despesas: [], economia: [] };
            document.getElementById('emailLogin').value = ''; 
            document.getElementById('senhaLogin').value = '';
            trocarPainelAuth('login'); 
        });
    }
};

window.abrirModalNotificacoes = function() { document.getElementById('modalNotificacoes').style.display = 'flex'; };
window.fecharModalNotificacoes = function() { document.getElementById('modalNotificacoes').style.display = 'none'; };
window.abrirModalApagarDados = function() { document.getElementById('modalConfirmarApagar').style.display = 'flex'; };
window.fecharModalApagarDados = function() { document.getElementById('modalConfirmarApagar').style.display = 'none'; };

window.executarApagarDados = async function() {
    fecharModalApagarDados();
    dadosLocais = { itens: [], receitas: [], despesas: [], economia: [] };
    await salvarNaNuvem();
    alert("Todos os dados da sua conta foram apagados com sucesso!");
};

window.salvarAtualizacaoPerfil = async function() {
    const nome = document.getElementById('atlzNome').value.trim();
    const sobrenome = document.getElementById('atlzSobrenome').value.trim();
    const apelido = document.getElementById('atlzApelido').value.trim();
    if (!nome || !sobrenome) { alert("Por favor, preencha o Nome e o Sobrenome."); return; }
    
    if (currentUserUid) {
        try {
            await setDoc(doc(db, "usuarios", currentUserUid), { nome: nome, sobrenome: sobrenome, apelido: apelido || nome }, { merge: true });
            alert("Dados atualizados com sucesso!");
            document.getElementById('painelAlertaPerfil').style.display = 'none';
            document.getElementById('nomeUserDisplay').innerText = apelido || nome;
            document.getElementById('frasePersonalizada').innerText = `Não gasta com besteira ${apelido || nome}, kkk`;
            document.getElementById('saudacaoUser').style.display = 'block';
            fecharModalNotificacoes();
        } catch (error) { alert("Erro: " + error.message); }
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        docRef = doc(db, "financeiro", currentUserUid);
        document.getElementById('tela-login').style.display = 'none';
        document.getElementById('conteudo-app').style.display = 'flex'; 
        
        const userDocSnap = await getDoc(doc(db, "usuarios", user.uid));
        const avatarLat = document.getElementById('avatarLateral'), avatarPad = document.getElementById('avatarLateralPadrao');
        const previewConf = document.getElementById('previewConfigAvatar'), padraoConf = document.getElementById('previewConfigPadrao');
        const saudacao = document.getElementById('saudacaoUser');

        if (userDocSnap.exists()) {
            const dadosUsuario = userDocSnap.data();
            document.getElementById('configEditNome').value = dadosUsuario.nome || '';
            document.getElementById('configEditSobrenome').value = dadosUsuario.sobrenome || '';
            document.getElementById('configEditApelido').value = dadosUsuario.apelido || '';

            if (dadosUsuario.temaPadrao) {
                localStorage.setItem('temaSolon', dadosUsuario.temaPadrao);
                aplicarTemaVisual(dadosUsuario.temaPadrao);
                document.getElementById('selectTema').value = dadosUsuario.temaPadrao;
                atualizarRotulosTemaPadrao(dadosUsuario.temaPadrao, dadosUsuario.temaPadrao);
            }
            if (dadosUsuario.fontePadrao) {
                localStorage.setItem('fonteSolon', dadosUsuario.fontePadrao);
                document.body.style.fontFamily = dadosUsuario.fontePadrao;
                document.getElementById('selectFonte').value = dadosUsuario.fontePadrao;
            }
            if (dadosUsuario.fotoPerfil) {
                avatarLat.src = dadosUsuario.fotoPerfil; avatarLat.style.display = 'block'; avatarPad.style.display = 'none';
                previewConf.src = dadosUsuario.fotoPerfil; previewConf.style.display = 'block'; padraoConf.style.display = 'none';
            }
            if (!dadosUsuario.nome || !dadosUsuario.sobrenome) {
                document.getElementById('painelAlertaPerfil').style.display = 'flex'; saudacao.style.display = 'none';
            } else {
                document.getElementById('painelAlertaPerfil').style.display = 'none';
                let nomeExibicao = dadosUsuario.apelido || dadosUsuario.nome;
                document.getElementById('nomeUserDisplay').innerText = nomeExibicao;
                document.getElementById('frasePersonalizada').innerText = `Não gasta com besteira ${nomeExibicao}, kkk`;
                saudacao.style.display = 'block';
            }
        }
        iniciarEscutaBanco();
    } else {
        if (unsubscribeFirestore) unsubscribeFirestore();
        currentUserUid = null;
        document.getElementById('tela-login').style.display = 'flex';
        document.getElementById('conteudo-app').style.display = 'none';
    }
});

function iniciarEscutaBanco() {
    if (!currentUserUid) return;
    unsubscribeFirestore = onSnapshot(doc(db, "financeiro", currentUserUid), (docSnap) => {
        if (docSnap.exists()) {
            dadosLocais = docSnap.data();
            if(!dadosLocais.economia) dadosLocais.economia = [];
        } else {
            dadosLocais = { itens: [], receitas: [], despesas: [], economia: [] };
            setDoc(doc(db, "financeiro", currentUserUid), dadosLocais);
        }
        atualizarTelaHTML(); renderizarReceitas(); renderizarDespesas(); renderizarEconomia();
        if (document.getElementById('btnSubMensal').classList.contains('ativo')) atualizarAnaliseMes();
        else zerarPainelLateralAnual();
    });
}

window.mudarAba = function(nomeAba) {
    document.querySelectorAll('.aba').forEach(aba => aba.classList.remove('ativa'));
    document.getElementById('aba-' + nomeAba).classList.add('ativa');
    document.querySelectorAll('.btn-nav').forEach(btn => btn.classList.remove('btn-ativo'));
    document.getElementById('btn-' + nomeAba).classList.add('btn-ativo');

    const menu = document.getElementById('menuLateralApp');
    if(menu) menu.classList.remove('aberto');
    document.body.classList.remove('menu-lateral-ativo');

    if(document.getElementById('opcoesMeses')) document.getElementById('opcoesMeses').style.display = 'none';
    if(document.getElementById('opcoesMesesReceita')) document.getElementById('opcoesMesesReceita').style.display = 'none';
    if(nomeAba === 'inicio') {
        if (document.getElementById('btnSubMensal').classList.contains('ativo')) atualizarAnaliseMes();
        else zerarPainelLateralAnual();
    } else if(nomeAba === 'receitas') {
        renderizarReceitas();
    } else if(nomeAba === 'despesas') {
        renderizarDespesas();
    }
};

window.filtrarExtrato = function(tipo) {
    filtroExtratoAtual = tipo;
    ['Todos', 'Fixa', 'Variável'].forEach(t => {
        let btn = document.getElementById('btnFiltro' + (t === 'Variável' ? 'Variavel' : t));
        if(btn) { if(t === tipo) btn.classList.add('ativo'); else btn.classList.remove('ativo'); }
    });
    if (document.getElementById('btnSubMensal').classList.contains('ativo')) atualizarAnaliseMes();
};

window.marcarModificadoStatus = function() { statusFoiModificado = true; };

window.abrirModalStatusMes = function(indexDespesa, mes, ano) {
    statusIndexDespesaModal = indexDespesa; statusMesModal = mes; statusAnoModal = ano; statusFoiModificado = false;
    let desp = dadosLocais.despesas[indexDespesa];
    let statusObj = (desp.statusPagamento && desp.statusPagamento[`${mes}_${ano}`]) || { situacao: 'Pendente', valorParcial: 0 };

    document.getElementById('txtSubModalStatus').innerText = `Despesa: ${desp.nome} (${mes}/${ano})`;
    document.getElementById('selectStatusPagamentoModal').value = typeof statusObj === 'string' ? (statusObj === 'Pago' ? 'Pago' : 'Pendente') : (statusObj.situacao || 'Pendente');
    document.getElementById('inputValorParcialModal').value = typeof statusObj === 'object' ? (statusObj.valorParcial || '') : '';
    alternarOpcaoValorParcialModal();
    document.getElementById('modalEditarStatusMes').style.display = 'flex';
};

window.alternarOpcaoValorParcialModal = function() {
    let sit = document.getElementById('selectStatusPagamentoModal').value;
    document.getElementById('containerValorParcialModal').style.display = sit === 'Parcial' ? 'block' : 'none';
    if (sit !== 'Parcial') document.getElementById('inputValorParcialModal').value = '';
};

window.tentarFecharModalStatus = function() {
    if (statusFoiModificado) document.getElementById('modalConfirmarSaida').style.display = 'flex';
    else fecharModalStatusMes();
};

window.acaoConfirmarSaida = function(salvar) {
    document.getElementById('modalConfirmarSaida').style.display = 'none';
    if (salvar) salvarStatusPagamentoModal();
    else fecharModalStatusMes();
};

window.fecharModalStatusMes = function() {
    document.getElementById('modalEditarStatusMes').style.display = 'none';
    statusIndexDespesaModal = -1; statusMesModal = ''; statusAnoModal = ''; statusFoiModificado = false;
};

window.salvarStatusPagamentoModal = async function() {
    if (statusIndexDespesaModal === -1) return;
    let desp = dadosLocais.despesas[statusIndexDespesaModal];
    if (!desp.statusPagamento) desp.statusPagamento = {};
    let sit = document.getElementById('selectStatusPagamentoModal').value;
    let valParcial = parseFloat(document.getElementById('inputValorParcialModal').value) || 0;

    if (sit === 'Parcial' && (isNaN(valParcial) || valParcial <= 0)) { alert('Informe um valor parcial válido.'); return; }
    desp.statusPagamento[`${statusMesModal}_${statusAnoModal}`] = { situacao: sit, valorParcial: sit === 'Parcial' ? valParcial : 0 };
    await salvarNaNuvem(); fecharModalStatusMes();
};

window.toggleDropdownMeses = function(id) {
    const dr = document.getElementById(id);
    dr.style.display = (dr.style.display === 'none' || dr.style.display === '') ? 'flex' : 'none';
};

document.addEventListener('click', function(event) {
    let clicouDentro = false;
    document.querySelectorAll('.multi-select').forEach(s => { if (s.contains(event.target)) clicouDentro = true; });
    if (!clicouDentro) {
        ['opcoesMeses', 'opcoesMesesReceita', 'opcoesMesesEdit', 'opcoesMesesEditReceita'].forEach(id => {
            let el = document.getElementById(id); if(el) el.style.display = 'none';
        });
        ['listaAnosSelecao', 'listaAnosReceitaSelecao', 'listaAnosEditSelecao', 'listaAnosEditReceitaSelecao'].forEach(id => {
            let el = document.getElementById(id); if(el) el.classList.remove('aberto');
        });
    }
});

function atualizarTelaHTML() {
    const lista = document.getElementById('lista-itens');
    if(!lista) return;
    lista.innerHTML = '';
    if (dadosLocais.itens && dadosLocais.itens.length > 0) {
        dadosLocais.itens.forEach(function(textoItem, index) {
            const li = document.createElement('li');
            li.className = 'item-anotacao';
            li.innerHTML = `<span>${textoItem}</span><button class="btn-lixeira-anotacao" onclick="solicitarRemocaoItemAnotacao(${index})">🗑️</button>`;
            lista.appendChild(li);
        });
    } else {
        lista.innerHTML = '<li style="color: #777; font-size: 13px; text-align: center; padding: 10px; border: none; background: transparent;">Nenhuma anotação rápida.</li>';
    }
}

window.atualizarAnaliseMes = function() {
    const mesSelecionado = document.getElementById('filtroMes').value;
    const anoSelecionado = document.getElementById('filtroAno').value;
    const ehMobile = document.body.classList.contains('modo-mobile');
    
    let totalReceitasMes = 0;
    if (dadosLocais.receitas) {
        dadosLocais.receitas.forEach(r => {
            let tipoR = r.tipo || 'Fixa';
            let atendePeriodoReceita = false;

            if (tipoR === 'Fixa') {
                atendePeriodoReceita = true;
            } else if (tipoR === 'FixaAte' && r.intervaloCompleto) {
                let inicioAbs = r.intervaloCompleto.inicio.ano * 12 + r.intervaloCompleto.inicio.mesIndex;
                let fimAbs = r.intervaloCompleto.fim.ano * 12 + r.intervaloCompleto.fim.mesIndex;
                let mesAtualAbs = parseInt(anoSelecionado) * 12 + mesesOrdem.indexOf(mesSelecionado);
                if (mesAtualAbs >= inicioAbs && mesAtualAbs <= fimAbs) atendePeriodoReceita = true;
            } else if (tipoR === 'Extra' && r.mesesPorAno) {
                if ((r.mesesPorAno[anoSelecionado] || []).includes(mesSelecionado)) atendePeriodoReceita = true;
            }

            if (atendePeriodoReceita) {
                totalReceitasMes += r.valor;
            }
        });
    }

    let totalDespesasMes = 0, totalPagoMes = 0, totalAPagarMes = 0;
    const listaExtratoHtml = document.getElementById('listaExtratoMes');
    if(!listaExtratoHtml) return;
    listaExtratoHtml.innerHTML = '';
    let despesasFiltradas = [];

    if (dadosLocais.despesas) {
        dadosLocais.despesas.forEach((d, indexOriginal) => {
            let atendePeriodo = false, valorMensalCalculado = d.valor;
            let tipoD = d.tipo || 'Fixa';

            if (tipoD === 'Fixa') {
                atendePeriodo = true;
            } else if (tipoD === 'FixaAte' && d.intervaloCompleto) {
                let inicioAbs = d.intervaloCompleto.inicio.ano * 12 + d.intervaloCompleto.inicio.mesIndex;
                let fimAbs = d.intervaloCompleto.fim.ano * 12 + d.intervaloCompleto.fim.mesIndex;
                let mesAtualAbs = parseInt(anoSelecionado) * 12 + mesesOrdem.indexOf(mesSelecionado);
                if (mesAtualAbs >= inicioAbs && mesAtualAbs <= fimAbs) atendePeriodo = true;
            } else if (tipoD === 'Variável' && d.mesesPorAno) {
                if ((d.mesesPorAno[anoSelecionado] || []).includes(mesSelecionado)) atendePeriodo = true;
            }

            if (atendePeriodo) {
                totalDespesasMes += valorMensalCalculado;
                let statusObj = (d.statusPagamento && d.statusPagamento[`${mesSelecionado}_${anoSelecionado}`]) || { situacao: 'Pendente', valorParcial: 0 };
                let sit = typeof statusObj === 'string' ? (statusObj === 'Pago' ? 'Pago' : 'Pendente') : (statusObj.situacao || 'Pendente');
                let valParcial = typeof statusObj === 'object' ? (statusObj.valorParcial || 0) : 0;

                let valorQuitadoCalculado = sit === 'Pago' ? valorMensalCalculado : (sit === 'Parcial' ? valParcial : 0);
                let valorPendenteCalculado = sit === 'Pago' ? 0 : (sit === 'Parcial' ? Math.max(0, valorMensalCalculado - valParcial) : valorMensalCalculado);

                totalPagoMes += valorQuitadoCalculado;
                totalAPagarMes += valorPendenteCalculado;

                if (filtroExtratoAtual === 'Todos' || filtroExtratoAtual === tipoD || (filtroExtratoAtual === 'Fixa' && tipoD === 'FixaAte')) {
                    
                    let rotuloExtrato = "Fixo";
                    if (tipoD === 'FixaAte' && d.intervaloCompleto) {
                        rotuloExtrato = `${d.intervaloCompleto.inicio.mesNome}/${d.intervaloCompleto.inicio.ano} a ${d.intervaloCompleto.fim.mesNome}/${d.intervaloCompleto.fim.ano}`;
                    } else if (tipoD === 'Variável' && d.mesesPorAno) {
                        let mesesAtivos = [];
                        Object.keys(d.mesesPorAno).forEach(ano => {
                            (d.mesesPorAno[ano] || []).forEach(m => mesesAtivos.push(`${m}/${ano}`));
                        });
                        if (mesesAtivos.length > 0) {
                            let primeiro = mesesAtivos[0];
                            rotuloExtrato = mesesAtivos.length > 1 ? `${primeiro} (+${mesesAtivos.length - 1})` : primeiro;
                        } else {
                            rotuloExtrato = "Variável";
                        }
                    }

                    despesasFiltradas.push({ indexOriginal, nome: d.nome, tipo: tipoD === 'FixaAte' ? 'Fixa Até' : tipoD, rotuloTempo: rotuloExtrato, valorParcela: valorMensalCalculado, situacao: sit, valorParcial: valParcial });
                }
            }
        });
    }

    if (despesasFiltradas.length === 0) {
        listaExtratoHtml.innerHTML = '<li style="color: #777; text-align: center; padding: 10px; font-size: 13px;">Nenhuma dívida encontrada.</li>';
    } else {
        despesasFiltradas.forEach(item => {
            let valFormat = item.valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            let badgeStatus = item.situacao === 'Pago' ? `<span class="status-pago">Pago</span>` : (item.situacao === 'Parcial' ? `<span class="status-parcial">Parcial (${item.valorParcial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</span>` : `<span class="status-pendente">Pendente</span>`);
            
            let li = document.createElement('li');
            li.className = 'item-extrato';
            if (ehMobile) {
                li.innerHTML = `
                    <div class="info-linha"><span class="nome">${item.nome}</span><span class="valor" style="color: #dc3545 !important;">${valFormat}</span></div>
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;"><span class="tipo-tag">${item.tipo}</span><span class="vezes-tag">${item.rotuloTempo}</span>${badgeStatus}</div>
                        <button class="btn-editar-status" onclick="abrirModalStatusMes(${item.indexOriginal}, '${mesSelecionado}', '${anoSelecionado}')">✏️</button>
                    </div>`;
            } else {
                li.innerHTML = `
                    <div class="info-linha"><span class="nome">${item.nome}</span><span class="tipo-tag">${item.tipo}</span><span class="vezes-tag">${item.rotuloTempo}</span>${badgeStatus}</div>
                    <div style="display: flex; align-items: center; gap: 10px;"><span class="valor" style="color: #dc3545 !important;">${valFormat}</span><button class="btn-editar-status" onclick="abrirModalStatusMes(${item.indexOriginal}, '${mesSelecionado}', '${anoSelecionado}')">✏️</button></div>`;
            }
            listaExtratoHtml.appendChild(li);
        });
    }

    let balancoReal = totalReceitasMes - totalPagoMes;
    let previsaoSobraDéficit = totalReceitasMes - totalDespesasMes;

    document.getElementById('analiseReceita').innerText = totalReceitasMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('analiseDespesa').innerText = totalDespesasMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('analisePago').innerText = totalPagoMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('analiseAPagar').innerText = totalAPagarMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    let elDisponivel = document.getElementById('analiseDisponivel');
    elDisponivel.innerText = previsaoSobraDéficit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    elDisponivel.className = previsaoSobraDéficit >= 0 ? "cor-receita" : "cor-despesa";
    
    let elSaldo = document.getElementById('analiseSaldo');
    elSaldo.innerText = balancoReal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    elSaldo.className = balancoReal >= 0 ? "cor-receita" : "cor-despesa";

    let somaTotalGrafico = totalReceitasMes + totalAPagarMes;
    let pctRec = somaTotalGrafico > 0 ? (totalReceitasMes / somaTotalGrafico) * 100 : 50;
    let pctDesp = somaTotalGrafico > 0 ? (totalAPagarMes / somaTotalGrafico) * 100 : 50;
    document.getElementById('barraRecFill').style.width = pctRec + '%';
    document.getElementById('barraDespFill').style.width = pctDesp + '%';
    document.getElementById('txtLegendaBarra').innerText = `Rec: ${pctRec.toFixed(0)}% | A Pagar: ${pctDesp.toFixed(0)}%`;

    let pctComp = totalReceitasMes > 0 ? (totalAPagarMes / totalReceitasMes) * 100 : (totalAPagarMes > 0 ? 100 : 0);
    if (pctComp > 100) pctComp = 100;
    let corCirc = pctComp > 80 ? '#dc3545' : (pctComp > 50 ? '#ffc107' : '#28a745');
    document.getElementById('graficoCirculo').style.background = `conic-gradient(${corCirc} 0% ${pctComp}%, #e9ecef ${pctComp}% 100%)`;
    document.getElementById('txtCirculoPorc').innerText = pctComp.toFixed(0) + '%';

    let badge = document.getElementById('badgeStatus'), txtDesc = document.getElementById('txtDescStatus');
    if (totalReceitasMes === 0 && totalDespesasMes === 0) { badge.innerText = "NEUTRO"; badge.style.backgroundColor = "#6c757d"; txtDesc.innerText = "Sem pendências"; }
    else if (previsaoSobraDéficit < 0) { badge.innerText = "DÉFICIT"; badge.style.backgroundColor = "#dc3545"; txtDesc.innerText = "Gastos maiores que entradas"; }
    else if (pctComp > 80) { badge.innerText = "ALERTA"; badge.style.backgroundColor = "#ffc107"; badge.style.color = "#333"; txtDesc.innerText = "Comprometimento alto"; }
    else { badge.innerText = "SAUDÁVEL"; badge.style.backgroundColor = "#28a745"; badge.style.color = "white"; txtDesc.innerText = "Balanço positivo"; }
};

// RENDERIZAR E FILTRAR RECEITAS
function renderizarReceitas() {
    const listaHtml = document.getElementById('lista-receitas-html');
    const dashValor = document.getElementById('dash-valor-receita');
    if(!listaHtml) return;
    listaHtml.innerHTML = '';
    let totalFiltrado = 0;

    let elMesFiltro = document.getElementById('filtroMesReceitaLista');
    let elAnoFiltro = document.getElementById('filtroAnoReceitaLista');
    
    const mesFiltroSelecionado = elMesFiltro ? elMesFiltro.value : mesesOrdem[new Date().getMonth()];
    const anoFiltroSelecionado = elAnoFiltro ? elAnoFiltro.value : new Date().getFullYear().toString();
    
    const mapaMesesTexto = {
        'Janeiro': 'Jan', 'Fevereiro': 'Fev', 'Março': 'Mar', 'Abril': 'Abr',
        'Maio': 'Mai', 'Junho': 'Jun', 'Julho': 'Jul', 'Agosto': 'Ago',
        'Setembro': 'Set', 'Outubro': 'Out', 'Novembro': 'Nov', 'Dezembro': 'Dez',
        'Jan': 'Jan', 'Fev': 'Fev', 'Mar': 'Mar', 'Abr': 'Abr', 'Mai': 'Mai', 'Jun': 'Jun',
        'Jul': 'Jul', 'Ago': 'Ago', 'Set': 'Set', 'Out': 'Out', 'Nov': 'Nov', 'Dez': 'Dez'
    };
    const mesFiltro = mapaMesesTexto[mesFiltroSelecionado] || mesFiltroSelecionado;
    const anoFiltro = anoFiltroSelecionado;

    if (!dadosLocais.receitas || dadosLocais.receitas.length === 0) {
        listaHtml.innerHTML = '<li style="color: #777; justify-content: center;">Nenhuma receita adicionada ainda.</li>';
        dashValor.innerText = "R$ 0,00"; return;
    }

    let receitasFiltradasParaMostrar = [];

    dadosLocais.receitas.forEach(function(receita, index) {
        let tipoR = receita.tipo || 'Fixa';
        let pertenceAoFiltro = false;

        if (window.modoFiltroReceita === 'todos') {
            pertenceAoFiltro = true;
        } else {
            if (tipoR === 'Fixa') {
                pertenceAoFiltro = true; 
            } else if (tipoR === 'FixaAte' && receita.intervaloCompleto) {
                let inicioAbs = receita.intervaloCompleto.inicio.ano * 12 + receita.intervaloCompleto.inicio.mesIndex;
                let fimAbs = receita.intervaloCompleto.fim.ano * 12 + receita.intervaloCompleto.fim.mesIndex;
                let filtroAbs = parseInt(anoFiltro) * 12 + mesesOrdem.indexOf(mesFiltro);
                if (filtroAbs >= inicioAbs && filtroAbs <= fimAbs) pertenceAoFiltro = true;
            } else if (tipoR === 'Extra' && receita.mesesPorAno) {
                if ((receita.mesesPorAno[anoFiltro] || []).includes(mesFiltro)) pertenceAoFiltro = true;
            }
        }

        if (pertenceAoFiltro) {
            receitasFiltradasParaMostrar.push({ itemObj: receita, indexOriginal: index });
            totalFiltrado += receita.valor;
        }
    });

    if (receitasFiltradasParaMostrar.length === 0) {
        listaHtml.innerHTML = `<li style="color: #777; justify-content: center; font-size: 13px;">Nenhuma receita encontrada para o período selecionado.</li>`;
    } else {
        receitasFiltradasParaMostrar.forEach(function(recMap) {
            let receita = recMap.itemObj;
            let index = recMap.indexOriginal;
            
            let valFormat = receita.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            let tipoTexto = receita.tipo === 'FixaAte' ? 'Fixa Até' : (receita.tipo === 'Extra' ? 'Receita Extra' : 'Fixa');
            
            let rotuloDetalhe = "Fixo";
            if (receita.tipo === 'FixaAte' && receita.intervaloCompleto) {
                rotuloDetalhe = `${receita.intervaloCompleto.inicio.mesNome}/${receita.intervaloCompleto.inicio.ano} a ${receita.intervaloCompleto.fim.mesNome}/${receita.intervaloCompleto.fim.ano}`;
            } else if (receita.tipo === 'Extra' && receita.mesesPorAno) {
                let mesesAtivos = [];
                Object.keys(receita.mesesPorAno).forEach(ano => {
                    (receita.mesesPorAno[ano] || []).forEach(m => mesesAtivos.push(`${m}/${ano}`));
                });
                if (mesesAtivos.length > 0) {
                    let primeiro = mesesAtivos[0];
                    rotuloDetalhe = mesesAtivos.length > 1 ? `${primeiro} (+${mesesAtivos.length - 1})` : primeiro;
                } else {
                    rotuloDetalhe = "Receita Extra";
                }
            }

            const li = document.createElement('li');
            li.innerHTML = `
                <div class="info-financa">
                    <span class="nome">${receita.nome} (${tipoTexto})</span>
                    <span class="detalhes">${rotuloDetalhe}</span>
                    <span class="valor-receita">${valFormat}</span>
                </div>
                <div class="botoes-acao">
                    <button class="btn-editar" onclick="abrirModalEditarReceita(${index})">✏️</button>
                    <button class="btn-lixeira" onclick="solicitarRemocaoReceita(${index})">🗑️</button>
                </div>`;
            listaHtml.appendChild(li);
        });
    }
    dashValor.innerText = totalFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// RENDERIZAR E FILTRAR DESPESAS (COM O MESMO PADRÃO DE RECEITAS)
function renderizarDespesas() {
    const listaHtml = document.getElementById('lista-despesas-html');
    const dashValor = document.getElementById('dash-valor-despesa');
    if(!listaHtml) return;
    listaHtml.innerHTML = '';
    let totalFiltrado = 0;

    let elMesFiltro = document.getElementById('filtroMesDespesaLista');
    let elAnoFiltro = document.getElementById('filtroAnoDespesaLista');
    
    const mesFiltroSelecionado = elMesFiltro ? elMesFiltro.value : mesesOrdem[new Date().getMonth()];
    const anoFiltroSelecionado = elAnoFiltro ? elAnoFiltro.value : new Date().getFullYear().toString();
    
    const mapaMesesTexto = {
        'Janeiro': 'Jan', 'Fevereiro': 'Fev', 'Março': 'Mar', 'Abril': 'Abr',
        'Maio': 'Mai', 'Junho': 'Jun', 'Julho': 'Jul', 'Agosto': 'Ago',
        'Setembro': 'Set', 'Outubro': 'Out', 'Novembro': 'Nov', 'Dezembro': 'Dez',
        'Jan': 'Jan', 'Fev': 'Fev', 'Mar': 'Mar', 'Abr': 'Abr', 'Mai': 'Mai', 'Jun': 'Jun',
        'Jul': 'Jul', 'Ago': 'Ago', 'Set': 'Set', 'Out': 'Out', 'Nov': 'Nov', 'Dez': 'Dez'
    };
    const mesFiltro = mapaMesesTexto[mesFiltroSelecionado] || mesFiltroSelecionado;
    const anoFiltro = anoFiltroSelecionado;

    if (!dadosLocais.despesas || dadosLocais.despesas.length === 0) {
        listaHtml.innerHTML = '<li style="color: #777; justify-content: center;">Nenhuma despesa adicionada ainda.</li>';
        dashValor.innerText = "R$ 0,00"; return;
    }

    let despesasFiltradasParaMostrar = [];

    dadosLocais.despesas.forEach(function(despesa, index) {
        let tipoD = despesa.tipo || 'Fixa';
        let pertenceAoFiltro = false;

        if (window.modoFiltroDespesa === 'todos') {
            pertenceAoFiltro = true;
        } else {
            if (tipoD === 'Fixa') {
                pertenceAoFiltro = true;
            } else if (tipoD === 'FixaAte' && despesa.intervaloCompleto) {
                let inicioAbs = despesa.intervaloCompleto.inicio.ano * 12 + despesa.intervaloCompleto.inicio.mesIndex;
                let fimAbs = despesa.intervaloCompleto.fim.ano * 12 + despesa.intervaloCompleto.fim.mesIndex;
                let filtroAbs = parseInt(anoFiltro) * 12 + mesesOrdem.indexOf(mesFiltro);
                if (filtroAbs >= inicioAbs && filtroAbs <= fimAbs) pertenceAoFiltro = true;
            } else if (tipoD === 'Variável' && despesa.mesesPorAno) {
                if ((despesa.mesesPorAno[anoFiltro] || []).includes(mesFiltro)) pertenceAoFiltro = true;
            }
        }

        if (pertenceAoFiltro) {
            despesasFiltradasParaMostrar.push({ itemObj: despesa, indexOriginal: index });
            totalFiltrado += despesa.valor;
        }
    });

    if (despesasFiltradasParaMostrar.length === 0) {
        listaHtml.innerHTML = `<li style="color: #777; justify-content: center; font-size: 13px;">Nenhuma despesa encontrada para o período selecionado.</li>`;
    } else {
        despesasFiltradasParaMostrar.forEach(function(despMap) {
            let despesa = despMap.itemObj;
            let index = despMap.indexOriginal;
            
            let valFormat = despesa.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            let tipoTexto = despesa.tipo === 'FixaAte' ? 'Fixa Até' : (despesa.tipo === 'Variável' ? 'Variável' : 'Fixa');
            
            let rotuloDetalhe = "Fixo";
            if (despesa.tipo === 'FixaAte' && despesa.intervaloCompleto) {
                rotuloDetalhe = `${despesa.intervaloCompleto.inicio.mesNome}/${despesa.intervaloCompleto.inicio.ano} a ${despesa.intervaloCompleto.fim.mesNome}/${despesa.intervaloCompleto.fim.ano}`;
            } else if (despesa.tipo === 'Variável' && despesa.mesesPorAno) {
                let mesesAtivos = [];
                Object.keys(despesa.mesesPorAno).forEach(ano => {
                    (despesa.mesesPorAno[ano] || []).forEach(m => mesesAtivos.push(`${m}/${ano}`));
                });
                if (mesesAtivos.length > 0) {
                    let primeiro = mesesAtivos[0];
                    rotuloDetalhe = mesesAtivos.length > 1 ? `${primeiro} (+${mesesAtivos.length - 1})` : primeiro;
                } else {
                    rotuloDetalhe = "Variável";
                }
            }

            const li = document.createElement('li');
            li.innerHTML = `
                <div class="info-financa">
                    <span class="nome">${despesa.nome} (${tipoTexto})</span>
                    <span class="detalhes">${rotuloDetalhe}</span>
                    <span class="valor-despesa" style="color: #dc3545 !important;">${valFormat}</span>
                </div>
                <div class="botoes-acao">
                    <button class="btn-editar" onclick="abrirModalEditarDespesa(${index})">✏️</button>
                    <button class="btn-lixeira" onclick="solicitarRemocaoDespesa(${index})">🗑️</button>
                </div>`;
            listaHtml.appendChild(li);
        });
    }
    dashValor.innerText = totalFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

window.filtrarDespesasPorSelecao = function() {
    window.modoFiltroDespesa = 'mes';
    const mes = document.getElementById('filtroMesDespesaLista').value;
    const ano = document.getElementById('filtroAnoDespesaLista').value;
    
    const mapa = {
        'Janeiro': 'Jan', 'Fevereiro': 'Fev', 'Março': 'Mar', 'Abril': 'Abr',
        'Maio': 'Mai', 'Junho': 'Jun', 'Julho': 'Jul', 'Agosto': 'Ago',
        'Setembro': 'Set', 'Outubro': 'Out', 'Novembro': 'Nov', 'Dezembro': 'Dez'
    };
    const mesCerto = mapa[mes] || mes;

    localStorage.setItem('filtroMesDespesaSelecionado', mesCerto);
    localStorage.setItem('filtroAnoDespesaSelecionado', ano);
    localStorage.setItem('modoFiltroDespesa', 'mes');
    renderizarDespesas();
};

window.limparFiltroDespesas = function() {
    window.modoFiltroDespesa = 'todos';
    localStorage.setItem('modoFiltroDespesa', 'todos');
    renderizarDespesas();
};

window.adicionarReceita = async function() {
    let nome = document.getElementById('nomeReceita').value.trim();
    let valor = parseFloat(document.getElementById('valorReceita').value);
    let tipo = document.getElementById('tipoReceita').value;
    if (!nome || isNaN(valor) || valor <= 0) { alert('Preencha nome e valor válidos!'); return; }

    if (!dadosLocais.receitas) dadosLocais.receitas = [];
    if (tipo === 'FixaAte') {
        if (!selecaoMesesFixaInicio || !selecaoMesesFixaFim) { alert('Selecione o período completo.'); return; }
        let inicioAbs = selecaoMesesFixaInicio.ano * 12 + selecaoMesesFixaInicio.mesIndex;
        let fimAbs = selecaoMesesFixaFim.ano * 12 + selecaoMesesFixaFim.mesIndex;
        dadosLocais.receitas.push({ nome, valor, tipo: 'FixaAte', intervaloCompleto: { inicio: selecaoMesesFixaInicio, fim: selecaoMesesFixaFim }, totalMesesContrato: (fimAbs - inicioAbs) + 1 });
    } else if (tipo === 'Extra') {
        let totalM = 0; Object.keys(selecaoMesesReceitaMap).forEach(a => { if (selecaoMesesReceitaMap[a]) totalM += selecaoMesesReceitaMap[a].length; });
        if (totalM === 0) { alert('Selecione pelo menos um mês.'); return; }
        dadosLocais.receitas.push({ nome, valor, tipo: 'Extra', mesesPorAno: JSON.parse(JSON.stringify(selecaoMesesReceitaMap)) });
    } else { dadosLocais.receitas.push({ nome, valor, tipo: 'Fixa' }); }

    limparCamposFormularioReceita();
    if(document.getElementById('opcoesMesesReceita')) document.getElementById('opcoesMesesReceita').style.display = 'none';
    await salvarNaNuvem();
};

window.adicionarDespesa = async function() {
    let nome = document.getElementById('nomeDespesa').value.trim();
    let valor = parseFloat(document.getElementById('valorDespesa').value);
    let tipo = document.getElementById('tipoDespesa').value;
    if (!nome || isNaN(valor) || valor <= 0) { alert('Preencha nome e valor válidos!'); return; }

    if (!dadosLocais.despesas) dadosLocais.despesas = [];
    if (tipo === 'FixaAte') {
        if (!selecaoMesesFixaInicio || !selecaoMesesFixaFim) { alert('Selecione o período completo.'); return; }
        let inicioAbs = selecaoMesesFixaInicio.ano * 12 + selecaoMesesFixaInicio.mesIndex;
        let fimAbs = selecaoMesesFixaFim.ano * 12 + selecaoMesesFixaFim.mesIndex;
        let total = (fimAbs - inicioAbs) + 1;
        dadosLocais.despesas.push({ nome, valor, tipo: 'FixaAte', intervaloCompleto: { inicio: selecaoMesesFixaInicio, fim: selecaoMesesFixaFim }, totalMesesContrato: total, parcelas: total, statusPagamento: {} });
    } else if (tipo === 'Variável') {
        let totalVar = 0; Object.keys(selecaoMesesVariavelMap).forEach(a => { if (selecaoMesesVariavelMap[a]) totalVar += selecaoMesesVariavelMap[a].length; });
        if (totalVar === 0) { alert('Selecione pelo menos um mês.'); return; }
        dadosLocais.despesas.push({ nome, valor, tipo: 'Variável', mesesPorAno: JSON.parse(JSON.stringify(selecaoMesesVariavelMap)), totalMesesContrato: totalVar, parcelas: totalVar, statusPagamento: {} });
    } else { dadosLocais.despesas.push({ nome, valor, tipo: 'Fixa', statusPagamento: {} }); }

    limparCamposFormularioDespesa();
    if(document.getElementById('opcoesMeses')) document.getElementById('opcoesMeses').style.display = 'none';
    await salvarNaNuvem();
};

async function salvarNaNuvem() {
    if (!currentUserUid) return;
    try { await setDoc(doc(db, "financeiro", currentUserUid), dadosLocais); } catch (e) { alert("Erro ao salvar!"); }
}

window.adicionarItem = async function() {
    let t = document.getElementById('novoItemTexto');
    if (!t.value.trim()) return;
    if (!dadosLocais.itens) dadosLocais.itens = [];
    dadosLocais.itens.push(t.value.trim());
    t.value = ''; await salvarNaNuvem();
};

document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const telaLogin = document.getElementById("tela-login");
        if (telaLogin && window.getComputedStyle(telaLogin).display !== "none") {
            event.preventDefault();
            const btnEntrar = document.querySelector("#tela-login button");
            if (btnEntrar) {
                btnEntrar.click();
            }
        }
    }
});
/**
 * public/scripts/packaging-conference.js
 * Lógica para a tela de conferência de medidas de embalagem.
 */

document.addEventListener('DOMContentLoaded', () => {
    const mlbInput = document.getElementById('mlbInput');
    const btnClear = document.getElementById('btnClear');
    const resultArea = document.getElementById('resultArea');
    const emptyState = document.getElementById('emptyState');
    
    // Elementos de exibição de dados
    const elTitle = document.getElementById('resultTitle');
    const elAltura = document.getElementById('resAltura');
    const elLargura = document.getElementById('resLargura');
    const elComprimento = document.getElementById('resComprimento');
    const elPeso = document.getElementById('resPeso');

    // Foca no input ao carregar
    if (mlbInput) mlbInput.focus();

    // Evento de Limpar
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            clearScreen();
            mlbInput.focus();
        });
    }

    // Evento de Bipagem (Change dispara quando o scanner envia "Enter")
    if (mlbInput) {
        mlbInput.addEventListener('change', async (e) => {
            const code = e.target.value.trim();
            if (!code) return;

            // Bloqueia input enquanto processa
            mlbInput.disabled = true;

            try {
                await checkPackaging(code);
            } catch (error) {
                console.error(error);
                if (window.ModalSystem) {
                    window.ModalSystem.alert('Erro', 'Ocorreu um erro ao consultar o servidor.');
                } else {
                    alert('Erro ao consultar servidor.');
                }
            } finally {
                // Limpa input e devolve foco para o próximo bip
                mlbInput.value = '';
                mlbInput.disabled = false;
                mlbInput.focus();
            }
        });
    }

    async function checkPackaging(mlbCode) {
        // Remove espaços extras
        const cleanCode = mlbCode.toUpperCase();

        const response = await fetch(`/pedidos/api/packaging/check?mlb=${encodeURIComponent(cleanCode)}`);
        const result = await response.json();

        if (result.success && result.found) {
            showResult(result.data);
        } else {
            // Se não encontrou, esconde o resultado anterior e mostra alerta
            hideResult();
            
            // Toca um som de erro se quiser (opcional)
            // playErrorSound();

            if (window.ModalSystem) {
                window.ModalSystem.alert('Não Encontrado', `Nenhuma medida cadastrada para o código: <strong>${cleanCode}</strong>`);
            } else {
                alert(`Medidas não encontradas para: ${cleanCode}`);
            }
        }
    }

    function showResult(data) {
        // Esconde o estado vazio
        emptyState.style.display = 'none';
        
        // Preenche os dados
        elTitle.textContent = data.mlb_anuncio || 'Anúncio Identificado';
        elAltura.textContent = formatNumber(data.altura);
        elLargura.textContent = formatNumber(data.largura);
        elComprimento.textContent = formatNumber(data.comprimento);
        elPeso.textContent = formatNumber(data.peso, 3); // 3 casas para peso

        // Mostra o card de resultado com animação simples
        resultArea.style.display = 'block';
        resultArea.classList.add('fade-in');
    }

    function hideResult() {
        resultArea.style.display = 'none';
        emptyState.style.display = 'block';
    }

    function clearScreen() {
        hideResult();
        mlbInput.value = '';
    }

    function formatNumber(val, decimals = 2) {
        if (val === null || val === undefined) return '-';
        return Number(val).toLocaleString('pt-BR', { 
            minimumFractionDigits: decimals, 
            maximumFractionDigits: decimals 
        });
    }

    // Mantém o foco no input se clicar fora (útil para operadores com scanner de mão)
    document.addEventListener('click', (e) => {
        // Se não estiver selecionando texto e não clicou num botão
        if (document.activeElement !== mlbInput && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
            mlbInput.focus();
        }
    });
});
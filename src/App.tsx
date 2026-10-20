import { useState, useRef } from 'react';
import './index.css';
import type { Participant, Expense } from './types';
import { calculateOutingSummary } from './logic';
import { usePersistentState } from './hooks';
import { toPng, toBlob } from 'html-to-image';
import logo from './assets/logo.png';

function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('es-AR', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function getTodayFormatted(): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function getTodayIsoString(): string {
  return new Date().toISOString().slice(0, 10);
}

function App() {
  const [participants, setParticipants] = usePersistentState<Participant[]>('participants', []);
  const [expenses, setExpenses] = usePersistentState<Expense[]>('expenses', []);
  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  
  // Expense Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [payerId, setPayerId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(() =>
    participants.map((p) => p.id)
  );

  // Calculation & Summary State
  const [showSummary, setShowSummary] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [textCopiedToast, setTextCopiedToast] = useState(false);
  const [todayText] = useState<string>(getTodayFormatted);

  const summaryRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const addParticipant = () => {
    const trimmedName = newName.trim();
    const trimmedAlias = newAlias.trim();
    if (!trimmedName) return;
    if (participants.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('Ya existe un participante con ese nombre');
      return;
    }
    const newParticipant: Participant = {
      id: crypto.randomUUID(),
      name: trimmedName,
      bankAlias: trimmedAlias || undefined,
    };
    const updated = [...participants, newParticipant];
    setParticipants(updated);
    setSelectedParticipants(updated.map((p) => p.id));
    setNewName('');
    setNewAlias('');
    setShowSummary(false);
  };

  const removeParticipant = (id: string) => {
    setParticipants(participants.filter((p) => p.id !== id));
    setExpenses(expenses.filter((e) => e.payerId !== id && !e.participantIds.includes(id)));
    setSelectedParticipants((prev) => prev.filter((pId) => pId !== id));
    setShowSummary(false);
  };

  const addExpense = () => {
    if (!description.trim() || !amount || !payerId || selectedParticipants.length === 0) {
      alert("Por favor completa la descripción, el monto, quién pagó y al menos un participante.");
      return;
    }
    const newExpense: Expense = {
      id: crypto.randomUUID(),
      description: description.trim(),
      amount: Number(amount),
      payerId,
      participantIds: selectedParticipants,
    };
    setExpenses([...expenses, newExpense]);
    setDescription('');
    setAmount('');
    // Reset selected participants back to all participants for next expense convenience
    setSelectedParticipants(participants.map((p) => p.id));
    setShowSummary(false);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter((e) => e.id !== id));
    setShowSummary(false);
  };

  const toggleParticipantInExpense = (id: string) => {
    if (selectedParticipants.includes(id)) {
      setSelectedParticipants(selectedParticipants.filter((pId) => pId !== id));
    } else {
      setSelectedParticipants([...selectedParticipants, id]);
    }
  };

  const selectAllParticipants = () => {
    setSelectedParticipants(participants.map((p) => p.id));
  };

  const clearSelectedParticipants = () => {
    setSelectedParticipants([]);
  };

  const handleCalculate = () => {
    setShowSummary(true);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const outingSummary = calculateOutingSummary(participants, expenses);

  const getAsciiSummary = () => {
    const separator = "------------------------------------------";
    const header = "            🎟️ TICKET amagi 🎟️           ";
    const date = `Fecha: ${todayText}`;
    
    let text = `${header}\n${date}\n${separator}\n\n`;
    
    text += "📊 RESUMEN GENERAL\n";
    text += `Total Gastado: ${formatCurrency(outingSummary.totalCost)}\n`;
    text += `Promedio por persona: ${formatCurrency(outingSummary.averagePerPerson)}\n\n`;

    text += "📝 DETALLE DE GASTOS\n";
    expenses.forEach(e => {
      const payer = participants.find(p => p.id === e.payerId)?.name || 'Desconocido';
      text += `- ${e.description}: ${formatCurrency(e.amount)} (Pagó: ${payer})\n`;
    });
    text += "\n";

    text += "👥 CONSUMO POR PERSONA\n";
    outingSummary.participantSummaries.forEach(ps => {
      text += `${ps.name.padEnd(15)} | Puso: ${formatCurrency(ps.paid).padStart(10)} | Cons.: ${formatCurrency(ps.consumed).padStart(10)}\n`;
    });
    text += "\n";

    text += "💸 TRANSFERENCIAS\n";
    if (outingSummary.settlements.length === 0) {
      text += "¡Están todos al día!\n";
    } else {
      outingSummary.settlements.forEach(s => {
        const toParticipant = participants.find(p => p.name === s.to);
        const aliasStr = toParticipant?.bankAlias ? ` (Alias: ${toParticipant.bankAlias})` : '';
        text += `${s.from} -> paga ${formatCurrency(s.amount)} a ${s.to}${aliasStr}\n`;
      });
    }
    
    text += `\n${separator}\n     Generado con amagi.github.io/amagi    \n${separator}`;
    return text;
  };

  const handleCopyTextSummary = () => {
    const text = getAsciiSummary();
    navigator.clipboard.writeText(text).then(() => {
      setTextCopiedToast(true);
      setTimeout(() => setTextCopiedToast(false), 3000);
    });
  };

  const handleDownloadImage = async () => {
    if (!summaryRef.current) return;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(summaryRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `resumen-gastos-${getTodayIsoString()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error al generar imagen:', err);
      alert('Hubo un error al generar la imagen. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareImage = async () => {
    if (!summaryRef.current) return;
    try {
      setIsExporting(true);
      const blob = await toBlob(summaryRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      if (!blob) throw new Error('No se pudo generar el archivo de imagen');

      const file = new File([blob], 'resumen-salida.png', { type: 'image/png' });

      // Native share if supported (e.g. mobile Safari / Chrome)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Resumen de Cuentas',
          text: `Resumen de la salida: ${formatCurrency(outingSummary.totalCost)} en total.`,
          files: [file],
        });
        return;
      }

      // Clipboard fallback
      if (navigator.clipboard && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 3000);
        return;
      }

      // If neither is available, trigger direct download
      handleDownloadImage();
    } catch (err) {
      console.error('Error al compartir imagen:', err);
      // If user cancelled native share, do not show error
      if (err instanceof Error && err.name !== 'AbortError') {
        alert('No se pudo compartir automáticamente. Descargando imagen...');
        handleDownloadImage();
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetAll = () => {
    if (confirm('¿Estás seguro de que quieres reiniciar toda la salida? Se borrarán participantes y gastos.')) {
      setExpenses([]);
      setParticipants([]);
      setSelectedParticipants([]);
      setShowSummary(false);
    }
  };

  return (
    <div className="container">
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img src={logo} alt="amagi logo" style={{ height: '80px', marginBottom: '1rem' }} />
        <h1 style={{ margin: 0 }}>amagi</h1>
        <p>Cuentas claras para salidas en grupo</p>
      </header>

      {/* 1. Amigos */}
      <section className="card">
        <h2>
          <span>1. Amigos en la salida</span>
          {participants.length > 0 && (
            <span className="badge-count">{participants.length} participantes</span>
          )}
        </h2>

        <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="text"
            placeholder="Nombre del amigo (ej: Lucas, Sofia...)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
          />
          <input
            type="text"
            placeholder="Alias/CBU/CVU (Opcional)"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
          />
          <button onClick={addParticipant} style={{ width: '100%' }}>+ Agregar Amigo</button>
        </div>

        {participants.length === 0 ? (
          <p className="empty-state">Agrega a los participantes para empezar a cargar gastos.</p>
        ) : (
          <div className="participant-tags">
            {participants.map((p) => (
              <div key={p.id} className="participant-tag">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>👤 {p.name}</span>
                  {p.bankAlias && <small style={{ fontSize: '0.7rem', opacity: 0.8 }}>Alias: {p.bankAlias}</small>}
                </div>
                <button
                  type="button"
                  title="Eliminar"
                  onClick={() => removeParticipant(p.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Cargar Gasto */}
      {participants.length >= 2 && (
        <section className="card">
          <h2>2. Cargar Gasto</h2>

          <div className="form-field">
            <label>Descripción</label>
            <input
              type="text"
              placeholder="Ej: Pizza, Cervezas, Uber, Helado"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>Monto total</label>
            <input
              type="number"
              placeholder="0.00"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div className="form-field">
            <label>¿Quién pagó?</label>
            <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              <option value="">Selecciona quién puso el dinero...</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <div className="chip-actions">
              <label style={{ margin: 0 }}>¿Quiénes participaron de este gasto?</label>
              <div className="chip-button-group">
                <button
                  type="button"
                  className="outline btn-sm"
                  onClick={selectAllParticipants}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className="outline btn-sm"
                  onClick={clearSelectedParticipants}
                >
                  Ninguno
                </button>
              </div>
            </div>

            <div className="chip-status-text">
              {selectedParticipants.length} de {participants.length} personas seleccionadas
            </div>

            {/* UX Button Chips */}
            <div className="chips-container">
              {participants.map((p) => {
                const isSelected = selectedParticipants.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => toggleParticipantInExpense(p.id)}
                  >
                    <span className="chip-icon">{isSelected ? '✓' : '+'}</span>
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={addExpense} style={{ width: '100%', marginTop: '10px' }}>
            ➕ Cargar Gasto
          </button>
        </section>
      )}

      {/* 3. Gastos Cargados */}
      {expenses.length > 0 && (
        <section className="card">
          <h2>
            <span>3. Gastos Cargados</span>
            <span className="badge-count">{expenses.length} gastos</span>
          </h2>

          <div>
            {expenses.map((e) => {
              const payer = participants.find((p) => p.id === e.payerId)?.name || 'Desconocido';
              const sharesWithAll = e.participantIds.length === participants.length;
              return (
                <div key={e.id} className="list-item">
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '1rem' }}>{e.description}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--primary-color)' }}>{formatCurrency(e.amount)}</strong> pagado por{' '}
                      <strong>{payer}</strong> • Dividido entre {sharesWithAll ? 'todos' : `${e.participantIds.length} personas`}
                    </div>
                  </div>
                  <button
                    className="danger"
                    title="Eliminar gasto"
                    onClick={() => removeExpense(e.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCalculate}
            className="btn-success"
            style={{ width: '100%', marginTop: '16px', fontSize: '1.05rem', padding: '12px' }}
          >
            📊 Resolver y Ver Resumen
          </button>
        </section>
      )}

      {/* 4. Resumen & Versión Compartible */}
      {showSummary && (
        <div ref={resultsRef} className="container" style={{ marginTop: '4px' }}>
          {/* Card exportable como imagen */}
          <div ref={summaryRef} className="shareable-card">
            <div className="ticket-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img src={logo} alt="amagi logo" style={{ height: '40px', marginBottom: '0.5rem' }} />
              <h3 style={{ margin: 0 }}>amagi</h3>
              <div className="ticket-date">{todayText}</div>
            </div>

            {/* Métricas Principales */}
            <div className="summary-stats-grid">
              <div className="stat-card">
                <div className="stat-val">{formatCurrency(outingSummary.totalCost)}</div>
                <div className="stat-lbl">Costo Total</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{formatCurrency(outingSummary.averagePerPerson)}</div>
                <div className="stat-lbl">Promedio p/ persona</div>
              </div>
            </div>

            {/* Detalle de Gastos (Nuevo en imagen) */}
            <div className="ticket-section-title">📝 Detalle de Gastos</div>
            <div style={{ marginBottom: '15px' }}>
              {expenses.map((e) => {
                const payer = participants.find((p) => p.id === e.payerId)?.name || 'Desconocido';
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px dashed #eee' }}>
                    <span><strong>{e.description}</strong> (por {payer})</span>
                    <span>{formatCurrency(e.amount)}</span>
                  </div>
                );
              })}
            </div>

            {/* ¿Cuánto gastó cada uno? */}
            <div className="ticket-section-title">👥 ¿Cuánto puso y consumió cada uno?</div>
            <div>
              {outingSummary.participantSummaries.map((ps) => {
                const isCreditor = ps.netBalance > 0.01;
                const isDebtor = ps.netBalance < -0.01;

                return (
                  <div key={ps.id} className="breakdown-row">
                    <div className="person-info">
                      <span className="person-name">{ps.name}</span>
                      <span className="person-sub">
                        Puso: {formatCurrency(ps.paid)} • Consumió: {formatCurrency(ps.consumed)}
                      </span>
                    </div>
                    <div>
                      {isCreditor && (
                        <span className="badge badge-positive">
                          Recibe +{formatCurrency(ps.netBalance)}
                        </span>
                      )}
                      {isDebtor && (
                        <span className="badge badge-negative">
                          Debe -{formatCurrency(Math.abs(ps.netBalance))}
                        </span>
                      )}
                      {!isCreditor && !isDebtor && (
                        <span className="badge badge-neutral">Al día</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Transferencias sugeridas */}
            <div className="ticket-section-title" style={{ marginTop: '18px' }}>
              💸 Transferencias a realizar
            </div>
            {outingSummary.settlements.length === 0 ? (
              <p className="empty-state" style={{ padding: '12px' }}>
                🎉 ¡Están todos al día! No hace falta hacer ninguna transferencia.
              </p>
            ) : (
              <div>
                {outingSummary.settlements.map((s, idx) => {
                  const toParticipant = participants.find(p => p.name === s.to);
                  return (
                    <div key={idx} className="settlement-card">
                      <div className="settlement-route">
                        <span className="settlement-name">{s.from}</span>
                        <span className="settlement-arrow">le paga a</span>
                        <span className="settlement-name">{s.to}</span>
                      </div>
                      <div className="settlement-amount">{formatCurrency(s.amount)}</div>
                      {toParticipant?.bankAlias && (
                        <div style={{ fontSize: '0.75rem', marginTop: '4px', textAlign: 'center', opacity: 0.8 }}>
                          Alias: <strong>{toParticipant.bankAlias}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ticket-footer" style={{ textAlign: 'center' }}>
              Generado con amagi.github.io/amagi
            </div>
          </div>

          {/* Botones de Acción para Exportar / Compartir */}
          <div className="card">
            <h2>Compartir Resumen</h2>
            <div className="export-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                className="btn-success"
                disabled={isExporting}
                onClick={handleShareImage}
                style={{ width: '100%' }}
              >
                {isExporting ? 'Generando...' : '🖼️ Compartir / Copiar Imagen'}
              </button>
              
              <button
                type="button"
                className="outline-primary"
                onClick={handleCopyTextSummary}
                style={{ width: '100%' }}
              >
                📋 Copiar Resumen de Texto (Ticket)
              </button>

              <button
                type="button"
                className="outline"
                disabled={isExporting}
                onClick={handleDownloadImage}
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                📥 Descargar PNG
              </button>
            </div>

            {copiedToast && (
              <p className="toast-msg">✅ ¡Imagen copiada al portapapeles!</p>
            )}
            
            {textCopiedToast && (
              <p className="toast-msg">✅ ¡Ticket de texto copiado al portapapeles!</p>
            )}

            <button
              type="button"
              className="outline"
              style={{ width: '100%', marginTop: '24px', color: 'var(--danger)', borderColor: '#fca5a5' }}
              onClick={handleResetAll}
            >
              🔄 Reiniciar toda la salida
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

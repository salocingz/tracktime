import React, { useState, useEffect } from 'react';
import { 
  Clock, CheckCircle2, Settings2, Timer, ArrowRight, TrendingUp, 
  TrendingDown, Save, History, ChevronUp, ChevronDown, Pencil, 
  Check, X, Trash2, Plus, Layout, Loader2 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- Inicialización de Firebase (Fuera del componente) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
let app, auth, db, appId;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
} catch (error) {
  console.error("Firebase initialization error", error);
}

export default function App() {
  // Estado para la navegación de pestañas ('calc' o 'history')
  const [activeTab, setActiveTab] = useState('calc');

  // --- Estados de Firebase ---
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Estados de la Calculadora ---
  const [attempterCount, setAttempterCount] = useState('');
  const [reviewerCount, setReviewerCount] = useState('');
  const [customMinutes, setCustomMinutes] = useState(10);
  const [idealMinutes, setIdealMinutes] = useState(10); // Nuevo estado para tiempo ideal editable

  // --- Estados del Historial ---
  const [history, setHistory] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', attempter: 0, reviewer: 0, customMinutes: 10, idealMinutes: 10, isNew: false });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // Para confirmación en UI en lugar de window.confirm

  // --- Efectos de Firebase (Autenticación y Sincronización) ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        // En tu app real, simplemente iniciamos sesión de forma anónima
        await signInAnonymously(auth);
      } catch (error) {
        console.error('Auth error:', error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) {
      if (!user) setIsLoading(false);
      return;
    }
    
    // Conectar a la colección privada del usuario
    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    
    // onSnapshot mantiene los datos sincronizados en tiempo real
    const unsubscribe = onSnapshot(historyRef, (snapshot) => {
      const historyData = snapshot.docs.map(doc => doc.data());
      historyData.sort((a, b) => b.id - a.id); // Orden descendente
      setHistory(historyData);
      setIsLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [user]);

  // Cálculos de la Calculadora
  const tasks = (parseInt(attempterCount) || 0) + (parseInt(reviewerCount) || 0);
  const idealTotalTime = tasks * (parseInt(idealMinutes) || 0);
  const adjustedTotalTime = tasks * customMinutes;

  const formatTime = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return '0 min';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours} h ${mins} min`;
    if (hours > 0) return `${hours} h`;
    return `${mins} min`;
  };

  const handleSave = async () => {
    if (!attempterCount && !reviewerCount) return;
    if (!user) return; // DB requiere usuario activo

    const now = new Date();
    const dateString = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newId = Date.now();
    const newRecord = {
      id: newId,
      date: dateString,
      attempter: parseInt(attempterCount) || 0,
      reviewer: parseInt(reviewerCount) || 0,
      customMinutes: customMinutes,
      idealMinutes: parseInt(idealMinutes) || 10,
      isNew: false
    };

    try {
      // Guardar en la nube
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', newId.toString()), newRecord);
      setAttempterCount('');
      setReviewerCount('');
      setCustomMinutes(10);
      setActiveTab('history');
    } catch (error) {
      console.error("Error al guardar:", error);
    }
  };

  const updateHistoryMinutes = async (id, delta) => {
    if (!user) return;
    const record = history.find(r => r.id === id);
    if (!record) return;
    
    const newMinutes = Math.max(1, record.customMinutes + delta);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', id.toString()), { customMinutes: newMinutes }, { merge: true });
    } catch (error) {
      console.error("Error actualizando minutos:", error);
    }
  };

  const handleEditClick = (record) => {
    setEditingId(record.id);
    setEditForm({ ...record, idealMinutes: record.idealMinutes || 10, isNew: false });
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    const updatedRecord = {
      ...editForm,
      attempter: parseInt(editForm.attempter) || 0,
      reviewer: parseInt(editForm.reviewer) || 0,
      customMinutes: parseInt(editForm.customMinutes) || 1,
      idealMinutes: parseInt(editForm.idealMinutes) || 10,
      isNew: false
    };
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', editingId.toString()), updatedRecord);
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelEdit = async () => {
    // Si era un registro manual en curso y se cancela, se elimina de la base
    if (editForm.isNew && user) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', editingId.toString()));
      } catch (e) { console.error(e); }
    }
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', id.toString()));
      if (editingId === id) setEditingId(null);
      setConfirmDeleteId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddManual = async () => {
    if (!user) return;
    const now = new Date();
    const dateString = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newId = Date.now();
    const newRecord = { id: newId, date: dateString, attempter: 0, reviewer: 0, customMinutes: 10, idealMinutes: 10, isNew: true };
    
    try {
      // Reservamos temporalmente el espacio en la DB
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', newId.toString()), newRecord);
      setEditingId(newId);
      setEditForm({ ...newRecord });
    } catch (e) {
      console.error(e);
    }
  };

  const historyTotals = history.reduce((acc, record) => {
    const t = record.attempter + record.reviewer;
    const recordIdeal = record.idealMinutes || 10;
    return {
      attempter: acc.attempter + record.attempter,
      reviewer: acc.reviewer + record.reviewer,
      ideal: acc.ideal + (t * recordIdeal),
      adjusted: acc.adjusted + (t * record.customMinutes)
    };
  }, { attempter: 0, reviewer: 0, ideal: 0, adjusted: 0 });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-8 px-4 font-sans text-slate-800">
      
      {/* CONTENEDOR PRINCIPAL ÚNICO */}
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col min-h-[650px]">
        
        {/* BARRA DE PESTAÑAS (Estilo Navegador) */}
        <div className="bg-slate-200 flex p-2 gap-1 border-b border-slate-300">
          <button 
            onClick={() => setActiveTab('calc')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'calc' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-300'
            }`}
          >
            <Timer className="w-4 h-4" />
            Calculadora
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'history' 
                ? 'bg-white text-purple-600 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-300'
            }`}
          >
            <History className="w-4 h-4" />
            Registro Diario
            {history.length > 0 && (
              <span className="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md text-[10px]">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* CONTENIDO DINÁMICO */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'calc' ? (
            /* VISTA CALCULADORA */
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-blue-600 p-6 text-white">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Timer className="w-6 h-6" /> Tracking de Tiempo
                </h1>
                <p className="text-blue-100 text-sm mt-1">Ingresa tus tareas del día.</p>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Attempter</label>
                    <input
                      type="number" min="0" placeholder="0" value={attempterCount}
                      onChange={(e) => setAttempterCount(e.target.value)}
                      className="w-full text-xl p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reviewer</label>
                    <input
                      type="number" min="0" placeholder="0" value={reviewerCount}
                      onChange={(e) => setReviewerCount(e.target.value)}
                      className="w-full text-xl p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-bold text-blue-600 uppercase">Tiempo Ideal</p>
                    <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-blue-200 shadow-sm">
                      <input
                        type="number" min="1" value={idealMinutes}
                        onChange={(e) => setIdealMinutes(e.target.value)}
                        className="w-10 text-xs text-center font-bold text-blue-700 outline-none"
                      />
                      <span className="text-[10px] text-blue-600 font-bold">min/u</span>
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-800">{formatTime(idealTotalTime)}</p>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase">Minutos reales por tarea</label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-slate-100 rounded-xl border border-slate-200">
                      <button onClick={() => setCustomMinutes(m => Math.max(1, m - 1))} className="p-3 hover:bg-slate-200 rounded-l-xl"><TrendingDown className="w-5 h-5" /></button>
                      <div className="w-12 text-center font-bold text-xl">{customMinutes}</div>
                      <button onClick={() => setCustomMinutes(m => m + 1)} className="p-3 hover:bg-slate-200 rounded-r-xl"><TrendingUp className="w-5 h-5" /></button>
                    </div>
                    <span className="text-slate-400 font-medium">minutos</span>
                  </div>
                </div>

                <div className={`rounded-2xl p-4 border transition-colors ${customMinutes > 10 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                  <p className="text-[10px] font-bold uppercase mb-1">Tiempo Proyectado</p>
                  <div className="flex justify-between items-end">
                    <p className="text-2xl font-black text-slate-800">{formatTime(adjustedTotalTime)}</p>
                    {tasks > 0 && customMinutes !== 10 && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${customMinutes > 10 ? 'bg-orange-200 text-orange-700' : 'bg-green-200 text-green-700'}`}>
                        {customMinutes > 10 ? '+' : '-'}{formatTime(Math.abs(adjustedTotalTime - idealTotalTime))}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={tasks === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]"
                >
                  <Save className="w-5 h-5" /> Guardar en Registro
                </button>
              </div>
            </div>
          ) : (
            /* VISTA HISTORIAL */
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-purple-600 p-6 text-white flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    <History className="w-6 h-6" /> Registro Diario
                  </h1>
                  <p className="text-purple-100 text-sm mt-1">Sumatoria histórica y logs.</p>
                </div>
                <button onClick={handleAddManual} className="p-2 bg-purple-500 hover:bg-purple-400 rounded-xl transition-colors" title="Añadir Manual">
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {isLoading ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                  <Loader2 className="w-10 h-10 mb-4 animate-spin text-purple-400" />
                  <p>Cargando registros de la nube...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No hay registros guardados aún.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Fecha/Hora</th>
                          <th className="px-4 py-3">Tareas</th>
                          <th className="px-4 py-3 text-right">Tiempo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history.map((record) => {
                          const isEditing = editingId === record.id;
                          const tTotal = record.attempter + record.reviewer;
                          
                          if (isEditing) {
                            return (
                              <tr key={record.id} className="bg-purple-50/50">
                                <td colSpan="3" className="p-4">
                                  <div className="space-y-3">
                                    <div className="flex gap-2">
                                      <input type="text" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} className="flex-1 p-2 text-xs border rounded-lg outline-none focus:ring-1 focus:ring-purple-500" placeholder="DD/MM HH:MM" />
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">Idl:</span>
                                        <input type="number" value={editForm.idealMinutes} onChange={e => setEditForm({...editForm, idealMinutes: e.target.value})} className="w-12 p-2 text-xs border rounded-lg text-right font-bold focus:ring-1 focus:ring-blue-500" title="Minutos Ideales" />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">Ajst:</span>
                                        <input type="number" value={editForm.customMinutes} onChange={e => setEditForm({...editForm, customMinutes: e.target.value})} className="w-12 p-2 text-xs border rounded-lg text-right font-bold focus:ring-1 focus:ring-purple-500" title="Minutos Ajustados" />
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <div className="flex-1 flex items-center bg-white border rounded-lg px-2">
                                        <span className="text-[10px] text-blue-600 font-bold mr-2">ATT</span>
                                        <input type="number" value={editForm.attempter} onChange={e => setEditForm({...editForm, attempter: e.target.value})} className="w-full p-1 text-xs outline-none" />
                                      </div>
                                      <div className="flex-1 flex items-center bg-white border rounded-lg px-2">
                                        <span className="text-[10px] text-purple-600 font-bold mr-2">REV</span>
                                        <input type="number" value={editForm.reviewer} onChange={e => setEditForm({...editForm, reviewer: e.target.value})} className="w-full p-1 text-xs outline-none" />
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                      {confirmDeleteId === record.id ? (
                                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg">
                                          <span className="text-xs text-red-600 font-bold px-1">¿Borrar?</span>
                                          <button onClick={() => handleDelete(record.id)} className="p-1 bg-red-600 text-white rounded hover:bg-red-700"><Check className="w-3.5 h-3.5" /></button>
                                          <button onClick={() => setConfirmDeleteId(null)} className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setConfirmDeleteId(record.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                      )}
                                      <button onClick={handleCancelEdit} className="px-3 py-1 text-xs font-bold text-slate-500">Cancelar</button>
                                      <button onClick={handleSaveEdit} className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg font-bold">Guardar</button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-4 py-3">
                                <span className="text-slate-400 text-[10px] block uppercase font-bold">{record.date.split(' ')[0]}</span>
                                <span className="text-slate-700 font-bold">{record.date.split(' ')[1]}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-bold">A:{record.attempter}</span>
                                  <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold">R:{record.reviewer}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="flex flex-col items-end">
                                    <span className="font-black text-slate-800">{formatTime(tTotal * record.customMinutes)}</span>
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Idl: {record.idealMinutes || 10}m | Real: {record.customMinutes}m</span>
                                  </div>
                                  <button onClick={() => handleEditClick(record)} className="p-1 text-slate-300 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* SUMATORIA TOTAL AL FINAL DEL SCROLL */}
                  <div className="bg-slate-800 m-4 rounded-2xl p-4 text-white shadow-lg sticky bottom-0">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-2">
                      <span>Total Acumulado</span>
                      <span>{historyTotals.attempter + historyTotals.reviewer} Tareas</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3">
                      <div>
                        <p className="text-[10px] text-blue-400 font-bold uppercase">Ideal</p>
                        <p className="text-lg font-bold">{formatTime(historyTotals.ideal)}</p>
                      </div>
                      <div className="text-right border-l border-slate-700 pl-4">
                        <p className="text-[10px] text-purple-400 font-bold uppercase">Ajustado</p>
                        <p className="text-lg font-bold">{formatTime(historyTotals.adjusted)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-slate-400 text-xs font-medium uppercase tracking-widest">Task Timer App v2.0</p>
    </div>
  );
}

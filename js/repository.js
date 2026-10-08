import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js';
import {getAuth,setPersistence,browserSessionPersistence,browserLocalPersistence,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,onSnapshot,runTransaction} from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {applyOperation,normalize} from './finance.js';
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
export const watchAuth = callback => onAuthStateChanged(auth,callback);
export async function configurePersistence(remember=false) { await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence); }
export async function login(email,password,remember=false) { await configurePersistence(remember); return signInWithEmailAndPassword(auth,email,password); }
export async function register(email,password,profile) {
  await configurePersistence(false);
  const credential = await createUserWithEmailAndPassword(auth,email,password);
  // Uma falha de perfil não desfaz a conta criada. A UI permite completar o perfil.
  try { await setDoc(doc(db,'usuarios',credential.user.uid),profile,{merge:true}); }
  catch { throw new Error('Conta criada, mas o perfil não foi salvo. Complete-o em Configurações.'); }
}
export const resetPassword = email => sendPasswordResetEmail(auth,email);
export const logout = () => signOut(auth);
export async function getProfile(uid) { const snapshot = await getDoc(doc(db,'usuarios',uid)); return snapshot.exists() ? snapshot.data() : {}; }
export const saveProfile = (uid,profile) => setDoc(doc(db,'usuarios',uid),profile,{merge:true});
export function watchFinance(uid,next,error) {
  return onSnapshot(doc(db,'financeiro',uid),snapshot=>{
    try { next(normalize(snapshot.exists()?snapshot.data():{})); } catch(cause) { error(cause); }
  },error);
}
export async function mutate(uid,operation) {
  if (auth.currentUser?.uid !== uid) throw new Error('Sua sessão terminou. Entre novamente.');
  if (!navigator.onLine) throw new Error('Você está sem conexão. Reconecte para salvar.');
  const reference = doc(db,'financeiro',uid);
  return runTransaction(db,async transaction=>{
    const snapshot = await transaction.get(reference);
    const data = applyOperation(snapshot.exists()?snapshot.data():{},operation);
    // Releitura + retry atômico: nunca envia uma cópia desatualizada da tela.
    if (!snapshot.exists() || data.revision !== snapshot.data().revision) transaction.set(reference,data);
  });
}
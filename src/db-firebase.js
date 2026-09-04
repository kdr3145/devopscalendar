// Firebase Firestore adapter that provides the same interface the app expects
// via window.claude.use("db"). Mirrors the artifact db API used by app.js.
import {
  collection as fsCollection, doc as fsDoc, onSnapshot,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query as fsQuery, where as fsWhere, orderBy as fsOrderBy, limit as fsLimit,
} from "firebase/firestore";

export function makeClaudeDb(fs) {
  const colRef = (path) => fsCollection(fs, ...path.split("/"));
  const docRef = (path) => fsDoc(fs, ...path.split("/"));

  function makeQuery(path) {
    const constraints = [];
    const api = {
      path,
      where(f, op, v) { constraints.push(fsWhere(f, op, v)); return api; },
      orderBy(f, d) { constraints.push(fsOrderBy(f, d || "asc")); return api; },
      limit(n) { constraints.push(fsLimit(n)); return api; },
      _q() { return constraints.length ? fsQuery(colRef(path), ...constraints) : colRef(path); },
      onSnapshot(next, errcb) {
        return onSnapshot(api._q(),
          (s) => next({ docs: s.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data() })) }),
          errcb || (() => {}));
      },
      get() {
        return getDocs(api._q()).then((s) => ({
          docs: s.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data() })),
        }));
      },
      doc(id) { return makeDoc(path + "/" + id); },
    };
    return api;
  }

  function makeDoc(path) {
    return {
      id: path.split("/").pop(),
      path,
      get() { return getDoc(docRef(path)).then((s) => ({ exists: s.exists(), data: () => s.data() })); },
      set(data) { return setDoc(docRef(path), data); },
      update(data) { return updateDoc(docRef(path), data); },
      delete() { return deleteDoc(docRef(path)); },
      onSnapshot(next, errcb) {
        return onSnapshot(docRef(path),
          (s) => next({ exists: s.exists(), data: () => s.data() }),
          errcb || (() => {}));
      },
      collection(p) { return makeQuery(path + "/" + p); },
    };
  }

  const db = { collection: (p) => makeQuery(p), doc: (p) => makeDoc(p) };
  window.claude = { use: (n) => Promise.resolve(n === "db" ? db : null) };
  return db;
}

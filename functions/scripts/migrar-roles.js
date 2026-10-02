// Migra el campo `rol` de los usuarios existentes: 'residente' -> 'propietario'.
//
// Por defecto hace una corrida en seco (no escribe nada), solo muestra
// cuántos usuarios cambiarían. Para aplicar el cambio de verdad:
//
//   node functions/scripts/migrar-roles.js --confirmar
//
// Requiere credenciales de administrador del proyecto. La forma más simple:
// 1. Firebase Console > Configuración del proyecto > Cuentas de servicio >
//    Generar nueva clave privada (descarga un .json).
// 2. Antes de correr el script:
//      set GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\a\esa-clave.json   (cmd)
//      $env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\a\esa-clave.json" (PowerShell)
// 3. Corre el script DESDE la carpeta functions/ (ahí está firebase-admin):
//      cd functions
//      node scripts/migrar-roles.js            (primero sin --confirmar, revisa la salida)
//      node scripts/migrar-roles.js --confirmar

const admin = require('firebase-admin');

const CONFIRMAR = process.argv.includes('--confirmar');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'alertbxt',
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('usuarios').where('rol', '==', 'residente').get();

  if (snap.empty) {
    console.log('No hay usuarios con rol "residente". Nada que migrar.');
    return;
  }

  console.log(`Encontrados ${snap.size} usuarios con rol "residente".`);

  if (!CONFIRMAR) {
    console.log('Corrida en seco (no se escribió nada). Usuarios que cambiarían:');
    snap.docs.forEach(doc => console.log(`  - ${doc.id} (${doc.data().nombre || 'sin nombre'}, ${doc.data().correo || 'sin correo'})`));
    console.log('\nPara aplicar el cambio real: node scripts/migrar-roles.js --confirmar');
    return;
  }

  const BATCH_SIZE = 400; // margen bajo el límite de 500 escrituras por lote de Firestore
  const docs = snap.docs;
  let migrados = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const lote = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(doc => {
      lote.update(doc.ref, { rol: 'propietario' });
    });
    await lote.commit();
    migrados += Math.min(BATCH_SIZE, docs.length - i);
    console.log(`Migrados ${migrados}/${docs.length}...`);
  }

  console.log(`Listo. ${migrados} usuarios actualizados de "residente" a "propietario".`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error en la migración:', error);
    process.exit(1);
  });

<p align="center">
  <img src="src/assets/icon/Alertlogo.png" width="120" />
</p>

<h1 align="center">AlertBxt</h1>

<p align="center">
  Plataforma web progresiva para la gestión de alertas comunitarias, avisos y recordatorios en conjuntos residenciales.
</p>

<p align="center">
  Angular • Ionic • Firebase • PWA
</p>

---

## 📌 Descripción del proyecto

AlertBxt es una aplicación web progresiva (PWA) diseñada para mejorar la comunicación y seguridad en comunidades residenciales.

Permite a los usuarios reportar alertas en tiempo real, gestionar avisos administrativos y crear recordatorios personales dentro de su comunidad.

El sistema está basado en roles (administrador y residente) y utiliza Firebase como backend en tiempo real.

---

## 🚨 Funcionalidades principales

### 👥 Usuarios
- Registro e inicio de sesión
- Roles: administrador y residente
- Gestión de perfil

### 🚨 Alertas (SOS)
- Creación de alertas en tiempo real por cualquier usuario
- Visualización de alertas en la comunidad

### 📢 Avisos
- Solo administradores pueden crear avisos
- Categorías: mantenimiento, emergencia, informativo

### 📝 Recordatorios
- Creación de recordatorios personales
- Gestión individual por usuario

### 🔔 Notificaciones
- Notificaciones locales en navegador/dispositivo

---

## 🧱 Arquitectura del sistema

- Frontend: Angular + Ionic
- Backend: Firebase
  - Authentication
  - Firestore Database
  - Storage
- Hosting: Firebase Hosting
- PWA: Service Workers habilitados

---

## 🔐 Seguridad

- Reglas de Firestore basadas en roles
- Validación de comunidad por usuario
- Restricción de acceso por autenticación
- Control de permisos por documento

---

## 📁 Estructura del proyecto

```bash
src/
 ├── app/
 │   ├── pages/
 │   │   ├── alertas-eventos/
 │   │   ├── gestion-avisos/
 │   │   ├── recordatorios/
 │   │   ├── login/
 │   │   ├── registro/
 │   │   ├── perfil-usuario/
 │   │   ├── forgot-password/
 │   │   ├── gestion-usuarios/
 │   │   └── unirse-vecindad/
 │   ├── services/
 │   ├── guards/
 │   ├── models/
 │   ├── app.routes.ts
 │   ├── app.config.ts
 │   └── app.component.ts
 │
 ├── assets/
 │   ├── icon/
 │   ├── sirena-alerta.webp
 │   └── Alertlogo.png
 │
 ├── environments/
 │   ├── environment.ts
 │   └── environment.prod.ts
 │
 ├── global.scss
 ├── index.html
 └── main.ts
```
---

## ⚙️ Instalación y ejecución

```bash
git clone https://github.com/Ju4nmar/alertbxt.git
cd alertbxt
npm install
ng serve
```

---

## 🚀 Build de producción

```bash
npm run build
```

---

## 🌐 Deploy

```bash
firebase deploy
```

---

## 👨‍💻 Autores

- Paola Andrea García Díaz  
- Juan Martín Hernández Pulgarín  
- Andrés Camilo Millán Arango  

---

## 📌 Estado del proyecto

✔ En desarrollo  
✔ Funcional  
✔ Desplegado en Firebase Hosting  



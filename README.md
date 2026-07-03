# AlertBxt

<p align="center">
  <img src="src/assets/icon/Alertlogo.png" alt="AlertBxt Logo" width="180">
</p>

<p align="center">
  <strong>Aplicación Web Progresiva (PWA) para la gestión de alertas, avisos y recordatorios en comunidades residenciales.</strong>
</p>

<p align="center">
Proyecto de grado · Ingeniería de Sistemas · UNIAJC
</p>

---

## Descripción

AlertBxt es una Aplicación Web Progresiva (PWA) desarrollada para mejorar la comunicación entre administradores y residentes dentro de comunidades residenciales.

Aunque nació como un proyecto aplicado a los conjuntos Aureal y Caña Dulce, su arquitectura permite adaptarse a cualquier conjunto residencial o comunidad que requiera una plataforma centralizada para gestionar alertas, avisos y recordatorios.

La aplicación fue desarrollada utilizando Angular, Ionic y Firebase, ofreciendo una experiencia moderna, rápida e instalable en dispositivos móviles y computadores.

---

## Estado del proyecto

**Versión actual:** v1.0.0

Estado:

- En desarrollo activo
- Funcional
- Desplegado en Firebase Hosting

### Próximas mejoras

- Notificaciones Push mediante Firebase Cloud Messaging (FCM)
- Mejoras de rendimiento
- Nuevas funciones para administradores
- Optimización de la experiencia de usuario

---

## Demo

Aplicación disponible en:

https://alertbxt.web.app

---

## Características

### Residentes

- Registro e inicio de sesión
- Creación de alertas SOS
- Creación de recordatorios
- Administración del perfil
- Unirse a una vecindad

### Administradores

- Gestión de avisos comunitarios
- Administración de usuarios
- Publicación de información para toda la comunidad

### Funcionalidades generales

- Autenticación con Firebase Authentication
- Base de datos en Firestore
- Aplicación Web Progresiva (PWA)
- Instalación en dispositivos móviles
- Notificaciones locales
- Control de acceso mediante roles

---

## Tecnologías utilizadas

Frontend

- Angular 20
- Ionic 8
- TypeScript
- SCSS

Backend / Cloud

- Firebase Authentication
- Cloud Firestore
- Firebase Hosting

Herramientas

- Angular CLI
- Capacitor
- Git
- GitHub

---

## Arquitectura del proyecto

```
src/
│
├── app/
│   ├── guards/
│   ├── models/
│   ├── pages/
│   └── services/
│
├── assets/
│
├── environments/
│
└── theme/
```

---

## Instalación

Clonar el repositorio

```bash
git clone https://github.com/Ju4nmar/alertbxt.git
```

Entrar al proyecto

```bash
cd alertbxt
```

Instalar dependencias

```bash
npm install
```

Ejecutar

```bash
ionic serve
```

Compilar

```bash
npm run build
```

---

## Estructura funcional

La aplicación cuenta con dos roles principales:

### Administrador

- Gestionar avisos
- Gestionar usuarios
- Administrar información de la comunidad

### Residente

- Crear alertas SOS
- Crear recordatorios
- Gestionar su perfil

---

## Seguridad

AlertBxt utiliza servicios de Firebase para:

- Firebase Authentication
- Cloud Firestore
- Reglas de seguridad mediante Firestore Rules
- Storage Rules

La configuración pública de Firebase utilizada por la aplicación corresponde únicamente a la configuración del cliente y no incluye credenciales privadas.

---

## Equipo de desarrollo

Proyecto desarrollado por:

- Paola Andrea García Díaz
- Juan Martín Hernández Pulgarín
- Andrés Camilo Millán Arango

Ingeniería de Sistemas

UNIAJC

---

## Licencia

Este proyecto se distribuye bajo la licencia MIT.

---

## Autor

Desarrollado como Proyecto de Grado para optar al título de Ingeniero de Sistemas.

2026
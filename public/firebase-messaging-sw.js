importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Same config as your App.jsx
firebase.initializeApp({
  apiKey:            "AIzaSyCWrRUdD38FC-KuwolmXFW4nKQbvEMSEU4",
  authDomain:        "hearbeat-3ae3f.firebaseapp.com",
  projectId:         "hearbeat-3ae3f",
  appId:             "1:76204205570:web:de072a57f76d495cc3e91b",
  messagingSenderId: "76204205570",
});

const messaging = firebase.messaging();

// This runs when a push arrives and the app is in the background or closed
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon:  '/images/hero.jpg',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: payload.data,
  });
});

// Handle notification click — opens the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        clientList[0].focus();
      } else {
        clients.openWindow('/');
      }
    })
  );
});

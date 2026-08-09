import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const style = document.createElement('style');
style.textContent = `
  *,*::before,*::after{box-sizing:border-box}
  html,body,#root{margin:0;height:100%}
  body{background:#f0eee9;-webkit-font-smoothing:antialiased;
       overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
  button{font:inherit;letter-spacing:inherit;color:inherit}
  button:active:not(:disabled){transform:scale(.975)}
  input{font:inherit}
  /* SCREENS.md: 空のときプレースホルダは #a8a29a。値と見分けがつくようにする */
  input::placeholder{color:#a8a29a;font-weight:400}
`;
document.head.appendChild(style);

// Service Worker はプッシュの受け取りだけ。
// 登録に失敗しても画面は止めない（通知は義務ではない）
import('./lib/push').then((m) => m.registerSW());

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);

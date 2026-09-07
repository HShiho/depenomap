import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import './design/tokens.css'

// 表示状態の器（UT-05）。store は画面に 1 つ
createApp(App).use(createPinia()).mount('#app')

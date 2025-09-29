<template>
  <div class="language-switcher">
    <el-dropdown @command="switchLanguage" trigger="click">
      <el-button class="language-button" text>
        <span class="current-lang-flag">{{ currentLangData.flag }}</span>
        <span class="current-lang-name">{{ currentLangData.name }}</span>
        <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="lang in supportedLocales"
            :key="lang.code"
            :command="lang.code"
            :class="{ active: currentLocale === lang.code }"
            class="language-option"
          >
            <span class="lang-flag">{{ lang.flag }}</span>
            <span class="lang-name">{{ lang.name }}</span>
            <el-icon v-if="currentLocale === lang.code" class="check-icon">
              <Check />
            </el-icon>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, Check } from '@element-plus/icons-vue'
import { setLocale, getCurrentLocale, supportedLocales } from '@/i18n'

const { locale } = useI18n()

const currentLocale = computed(() => getCurrentLocale())

const currentLangData = computed(() => {
  return supportedLocales.find(lang => lang.code === currentLocale.value) || supportedLocales[0]
})

const switchLanguage = (langCode: string) => {
  setLocale(langCode)
}
</script>

<style scoped>
.language-switcher {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
}

.language-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  font-size: 14px;
  color: #333;
}

.language-button:hover {
  border-color: #2c9db3;
  box-shadow: 0 4px 12px rgba(44, 157, 179, 0.15);
}

.current-lang-flag {
  font-size: 16px;
}

.current-lang-name {
  font-weight: 500;
}

.dropdown-icon {
  font-size: 12px;
  transition: transform 0.3s ease;
}

.language-button:hover .dropdown-icon {
  transform: translateY(1px);
}

.language-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px !important;
  min-width: 120px;
}

.language-option.active {
  background: rgba(44, 157, 179, 0.1);
  color: #2c9db3;
}

.lang-flag {
  font-size: 16px;
}

.lang-name {
  flex: 1;
  font-weight: 500;
}

.check-icon {
  font-size: 14px;
  color: #2c9db3;
}

/* Element Plus Dropdown Overrides */
:deep(.el-dropdown-menu) {
  border-radius: 8px !important;
  border: 1px solid #e0e0e0 !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
}

:deep(.el-dropdown-menu__item:hover) {
  background-color: rgba(44, 157, 179, 0.05) !important;
}

@media (max-width: 768px) {
  .language-switcher {
    top: 10px;
    right: 10px;
  }

  .language-button {
    padding: 6px 12px;
    font-size: 13px;
  }

  .current-lang-name {
    display: none;
  }
}
</style>
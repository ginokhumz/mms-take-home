<script setup lang="ts">
import FaultPanel from './components/FaultPanel.vue';
import TimelineView from './components/TimelineView.vue';
</script>

<template>
  <main>
    <h1>Chirp</h1>
    <FaultPanel />
    <TimelineView />
  </main>
</template>

<style scoped>
main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 6rem;
  font-family: system-ui, sans-serif;
  line-height: 1.45;
}
h1 {
  font-size: 1.4rem;
  margin: 0 0 1rem;
}
</style>

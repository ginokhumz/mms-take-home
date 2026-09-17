<template>
  <!-- The push set was unavailable and this page came from the pull path alone: fewer items than
       usual, and posts from narrow-fanout authors may be missing. It is not an error — the page is
       a 200 and the list still renders. -->
  <p role="status" class="degraded">Some posts may be missing right now. Showing what we could load.</p>
</template>

<style scoped>
.degraded {
  border: 1px solid #a67c00;
  background: #fffaf0;
  padding: 0.6rem 1rem;
  margin: 0.75rem 0;
  font-size: 0.9rem;
}
</style>

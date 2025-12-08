<script setup lang="ts">
import {useI18n} from "vue-i18n";

const { t: $t } = useI18n()

</script>

<template>
  <v-row>
    <v-col cols="12">
      <v-alert
          variant="tonal"
          color="red"
          icon="mdi-information"
          class="mt-4"
      >
  {{$t('redStoneMusic.unimplemented')}}
      </v-alert>
    </v-col>
  </v-row>
</template>

<style scoped>

</style>
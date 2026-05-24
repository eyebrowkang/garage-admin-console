// Module Federation async boundary: defer the real bootstrap to a chunk
// loaded AFTER the host has initialized its shared-deps container.
import('./bootstrap');

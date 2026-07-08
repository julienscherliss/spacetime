ALTER TABLE public.live_activity_devices
  ADD COLUMN IF NOT EXISTS apns_environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.live_activity_devices
  ADD COLUMN IF NOT EXISTS bundle_identifier text NOT NULL DEFAULT 'com.spacetimelabs.spacetime';

UPDATE public.live_activity_devices
SET apns_environment = 'production'
WHERE apns_environment IS NULL OR apns_environment = '';

UPDATE public.live_activity_devices
SET bundle_identifier = 'com.spacetimelabs.spacetime'
WHERE bundle_identifier IS NULL OR bundle_identifier = '';
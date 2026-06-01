import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DetailPageHeader as UiDetailPageHeader } from '@garage/ui';

interface DetailPageHeaderProps {
  backTo: string;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}

/**
 * Router-bound wrapper over @garage/ui's DetailPageHeader: maps the admin's
 * `backTo` path onto the shared header's `onBack` callback so the visual chrome
 * stays single-sourced while navigation remains react-router driven.
 */
export function DetailPageHeader({ backTo, ...rest }: DetailPageHeaderProps) {
  const navigate = useNavigate();
  return <UiDetailPageHeader onBack={() => navigate(backTo)} {...rest} />;
}

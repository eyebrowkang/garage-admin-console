import { Fragment, type ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  DetailPageHeader as UiDetailPageHeader,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@garage/ui';

export interface BreadcrumbSpec {
  label: string;
  /** When set (and not the last crumb), the label becomes a react-router link. */
  to?: string;
}

interface DetailPageHeaderProps {
  /** Legacy back-button target. Ignored when `breadcrumbs` is provided. */
  backTo?: string;
  /** Wayfinding crumbs, root → current. The last entry renders as the page. */
  breadcrumbs?: BreadcrumbSpec[];
  /** Page title (h1). Optional — omit when the breadcrumb + content carry the identity. */
  title?: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}

/**
 * Router-bound wrapper over @garage/ui's DetailPageHeader. Renders react-router
 * `<Link>`s into the shared, router-free Breadcrumb primitive (via
 * `BreadcrumbLink asChild`) so the visual chrome stays single-sourced while
 * navigation remains react-router driven. Falls back to the legacy `backTo`
 * button when no breadcrumbs are supplied.
 */
export function DetailPageHeader({ backTo, breadcrumbs, ...rest }: DetailPageHeaderProps) {
  const navigate = useNavigate();

  const breadcrumb = breadcrumbs?.length ? (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem className="min-w-0">
                {crumb.to && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="max-w-[55vw] sm:max-w-sm">{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator />
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  ) : undefined;

  return (
    <UiDetailPageHeader
      breadcrumb={breadcrumb}
      onBack={!breadcrumb && backTo ? () => navigate(backTo) : undefined}
      {...rest}
    />
  );
}

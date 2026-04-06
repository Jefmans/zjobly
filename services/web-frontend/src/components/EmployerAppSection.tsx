import { ComponentProps } from 'react';
import { CandidateDetailView } from './CandidateDetailView';
import { CandidateFavoritesView } from './CandidateFavoritesView';
import { CandidateMatchesView } from './CandidateMatchesView';
import { CandidateSearchFlow } from './CandidateSearchFlow';
import { EmployerInvitationsView } from './EmployerInvitationsView';
import { JobCreationFlow } from './JobCreationFlow';

type Props = {
  jobCreationFlowProps: ComponentProps<typeof JobCreationFlow>;
  candidateDetailViewProps: ComponentProps<typeof CandidateDetailView>;
  candidateFavoritesViewProps: ComponentProps<typeof CandidateFavoritesView>;
  employerInvitationsViewProps: ComponentProps<typeof EmployerInvitationsView>;
  candidateSearchFlowProps: ComponentProps<typeof CandidateSearchFlow>;
  candidateMatchesViewProps: ComponentProps<typeof CandidateMatchesView>;
};

export function EmployerAppSection({
  jobCreationFlowProps,
  candidateDetailViewProps,
  candidateFavoritesViewProps,
  employerInvitationsViewProps,
  candidateSearchFlowProps,
  candidateMatchesViewProps,
}: Props) {
  return (
    <>
      <JobCreationFlow {...jobCreationFlowProps} />
      <CandidateDetailView {...candidateDetailViewProps} />
      <CandidateFavoritesView {...candidateFavoritesViewProps} />
      <EmployerInvitationsView {...employerInvitationsViewProps} />
      <CandidateSearchFlow {...candidateSearchFlowProps} />
      <CandidateMatchesView {...candidateMatchesViewProps} />
    </>
  );
}

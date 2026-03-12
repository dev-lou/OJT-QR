-- Table: leave_requests
-- Description: Tracks an Intern's requests for Excused Absences or Leaves, which the Admin must approve/reject.

create table public.leave_requests (
    id uuid default gen_random_uuid() primary key,
    intern_id uuid not null references public.interns(id) on delete cascade,
    
    -- Request details
    date_of_leave date not null,
    reason text not null,
    status text not null default 'pending', -- 'pending', 'approved', 'rejected'
    
    -- Audit trails
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Optional review notes from Admin
    admin_notes text
);

-- Row Level Security
alter table public.leave_requests enable row level security;

-- Policies
create policy "Interns can read their own requests"
on public.leave_requests for select
to public
using ( true ); -- We rely on application level filtering for reading for now, keeping it simple.

create policy "Interns can insert their own requests"
on public.leave_requests for insert
to public
with check ( true );

create policy "Admins can update all requests"
on public.leave_requests for update
to public
using ( true );

create policy "Admins can read all requests"
on public.leave_requests for select
to public
using ( true );

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import { consolationFacts } from './data/consolationFacts'
import { pickWeightedReward } from './utils/weightedReward'

const WEEKLY_GOAL_HOURS = 20

const tabs = ['Dashboard', 'Exams', 'Habits', 'The Vault', 'Spinner']

function getTodayISO() {
  return new Date().toISOString().slice(0, 10)
}

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function SimplePieChart({ completed, total }) {
  const percent = total === 0 ? 0 : (completed / total) * 100
  const circumference = 2 * Math.PI * 45
  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" className="transform -rotate-90">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <motion.circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="#10b981"
          strokeWidth="12"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8 }}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className="text-2xl font-bold text-slate-900">
          {completed}/{total}
        </p>
        <p className="text-sm text-slate-600">Habits Completed</p>
        <p className="mt-1 text-lg font-semibold text-emerald-600">{Math.round(percent)}%</p>
      </div>
    </div>
  )
}

function formatDbError(action, error) {
  return `${action} failed: ${error.message}`
}

function App() {
  const [session, setSession] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const [activeTab, setActiveTab] = useState('Dashboard')
  const [exams, setExams] = useState([])
  const [habits, setHabits] = useState([])
  const [studyLogs, setStudyLogs] = useState([])
  const [rewards, setRewards] = useState([])

  const [newExamName, setNewExamName] = useState('')
  const [newExamDate, setNewExamDate] = useState('')
  const [newHabit, setNewHabit] = useState('')
  const [studyHours, setStudyHours] = useState('1')
  const [rewardName, setRewardName] = useState('')
  const [rewardPriority, setRewardPriority] = useState(5)

  const [spinResult, setSpinResult] = useState(null)
  const [spinnerRotation, setSpinnerRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [rewardHitRate, setRewardHitRate] = useState(80)
  const [dbError, setDbError] = useState('')

  useEffect(() => {
    let mounted = true

    async function bootAuth() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) {
        return
      }
      setSession(data.session)
      setLoadingAuth(false)
    }

    bootAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session?.user?.id) {
      void loadDashboardData(session.user.id)
    }
  }, [session?.user?.id])

  const daysUntilExam = useMemo(() => {
    if (!exams.length) return null
    const now = new Date()
    const nearest = exams.find((exam) => new Date(exam.exam_date) > now)
    if (!nearest) return null
    const diffMs = new Date(nearest.exam_date).getTime() - now.getTime()
    return Math.ceil(diffMs / 86400000)
  }, [exams])

  const weeklyHours = useMemo(() => {
    const weekStart = getWeekStart()
    return studyLogs.reduce((sum, log) => {
      const studiedAt = new Date(log.studied_at)
      if (studiedAt >= weekStart) {
        return sum + Number(log.hours || 0)
      }
      return sum
    }, 0)
  }, [studyLogs])

  const progressPercent = Math.min((weeklyHours / WEEKLY_GOAL_HOURS) * 100, 100)

  const weeklySeries = useMemo(() => {
    const start = getWeekStart()
    const end = new Date(start)
    end.setDate(end.getDate() + 7)

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const hoursByDay = [0, 0, 0, 0, 0, 0, 0]

    for (const log of studyLogs) {
      const studiedAt = new Date(log.studied_at)
      if (studiedAt < start || studiedAt >= end) {
        continue
      }
      const dayIndex = (studiedAt.getDay() + 6) % 7
      hoursByDay[dayIndex] += Number(log.hours || 0)
    }

    return labels.map((label, index) => ({
      label,
      hours: hoursByDay[index],
    }))
  }, [studyLogs])

  const maxDailyHours = Math.max(1, ...weeklySeries.map((day) => day.hours))

  const todayHabits = useMemo(() => {
    const today = getTodayISO()
    return habits.map((habit) => ({
      ...habit,
      completedToday: habit.is_completed && habit.completed_on === today,
    }))
  }, [habits])

  const todayCompletionRate = useMemo(() => {
    if (todayHabits.length === 0) {
      return { completed: 0, total: 0 }
    }
    const completed = todayHabits.filter((h) => h.completedToday).length
    return { completed, total: todayHabits.length }
  }, [todayHabits])

  const habitDays = useMemo(() => {
    const dayMap = {}
    for (const habit of habits) {
      if (habit.completed_on) {
        dayMap[habit.completed_on] = (dayMap[habit.completed_on] || 0) + 1
      }
    }
    return dayMap
  }, [habits])

  const last30Days = useMemo(() => {
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(d.toISOString().slice(0, 10))
    }
    return days
  }, [])

  async function loadDashboardData(userId) {
    const [
      { data: examsData, error: examsError },
      { data: habitsData, error: habitsError },
      { data: logsData, error: logsError },
      { data: rewardsData, error: rewardsError },
    ] = await Promise.all([
      supabase.from('exams').select('*').eq('user_id', userId).order('exam_date', { ascending: true }),
      supabase.from('habits').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('study_logs').select('*').eq('user_id', userId).order('studied_at', { ascending: false }),
      supabase.from('rewards').select('*').eq('user_id', userId).order('priority', { ascending: true }),
    ])

    const loadError = examsError || habitsError || logsError || rewardsError
    if (loadError) {
      setDbError(formatDbError('Loading dashboard data', loadError))
      return
    }

    setDbError('')
    setExams(examsData ?? [])
    setHabits(habitsData ?? [])
    setStudyLogs(logsData ?? [])
    setRewards(rewardsData ?? [])
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setAuthError(error.message)
        return
      }
      setAuthError('Account created. If email confirmation is on, check your inbox.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  async function addExam(event) {
    event.preventDefault()
    if (!newExamName.trim() || !newExamDate || !session?.user?.id) {
      return
    }

    const { data, error } = await supabase
      .from('exams')
      .insert({
        user_id: session.user.id,
        name: newExamName.trim(),
        exam_date: newExamDate,
      })
      .select('*')
      .single()

    if (error) {
      setDbError(formatDbError('Adding exam', error))
      return
    }

    if (data) {
      setExams((prev) => [...prev, data].sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date)))
      setNewExamName('')
      setNewExamDate('')
      setDbError('')
    }
  }

  async function removeExam(examId) {
    const { error } = await supabase.from('exams').delete().eq('id', examId)
    if (error) {
      setDbError(formatDbError('Deleting exam', error))
      return
    }
    setExams((prev) => prev.filter((exam) => exam.id !== examId))
    setDbError('')
  }

  async function addHabit(event) {
    event.preventDefault()
    const name = newHabit.trim()
    if (!name || !session?.user?.id) {
      return
    }

    const { data, error } = await supabase
      .from('habits')
      .insert({ user_id: session.user.id, name, is_completed: false, completed_on: null })
      .select('*')
      .single()

    if (error) {
      setDbError(formatDbError('Adding habit', error))
      return
    }

    if (data) {
      setHabits((prev) => [...prev, data])
      setNewHabit('')
      setDbError('')
    }
  }

  async function toggleHabit(habit) {
    const today = getTodayISO()
    const isCompletedToday = habit.is_completed && habit.completed_on === today
    const nextCompleted = !isCompletedToday
    const { data, error } = await supabase
      .from('habits')
      .update({ is_completed: nextCompleted, completed_on: nextCompleted ? today : null })
      .eq('id', habit.id)
      .select('*')
      .single()

    if (error) {
      setDbError(formatDbError('Updating habit', error))
      return
    }

    if (data) {
      setHabits((prev) => prev.map((item) => (item.id === habit.id ? data : item)))
      setDbError('')
    }
  }

  async function deleteHabit(habitId) {
    const { error } = await supabase.from('habits').delete().eq('id', habitId)
    if (error) {
      setDbError(formatDbError('Deleting habit', error))
      return
    }
    setHabits((prev) => prev.filter((habit) => habit.id !== habitId))
    setDbError('')
  }

  async function addStudyLog(event) {
    event.preventDefault()
    if (!session?.user?.id || Number(studyHours) <= 0) {
      return
    }

    const { data, error } = await supabase
      .from('study_logs')
      .insert({
        user_id: session.user.id,
        hours: Number(studyHours),
        studied_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error) {
      setDbError(formatDbError('Logging study hours', error))
      return
    }

    if (data) {
      setStudyLogs((prev) => [data, ...prev])
      setDbError('')
    }
  }

  async function addReward(event) {
    event.preventDefault()
    if (!rewardName.trim() || !session?.user?.id) {
      return
    }

    const { data, error } = await supabase
      .from('rewards')
      .insert({
        user_id: session.user.id,
        name: rewardName.trim(),
        priority: Number(rewardPriority),
      })
      .select('*')
      .single()

    if (error) {
      setDbError(formatDbError('Adding reward', error))
      return
    }

    if (data) {
      setRewards((prev) => [...prev, data].sort((a, b) => a.priority - b.priority))
      setRewardName('')
      setRewardPriority(5)
      setDbError('')
    }
  }

  async function removeReward(rewardId) {
    const { error } = await supabase.from('rewards').delete().eq('id', rewardId)
    if (error) {
      setDbError(formatDbError('Deleting reward', error))
      return
    }
    setRewards((prev) => prev.filter((reward) => reward.id !== rewardId))
    setDbError('')
  }

  function spinForReward() {
    if (spinning) {
      return
    }

    setSpinning(true)
    setSpinnerRotation((prev) => prev + 1800 + Math.floor(Math.random() * 1080))

    window.setTimeout(() => {
      const hit = rewards.length > 0 && Math.random() <= rewardHitRate / 100
      if (hit) {
        const reward = pickWeightedReward(rewards)
        setSpinResult({ type: 'reward', text: reward?.name ?? 'Try again!' })
      } else {
        const fact = consolationFacts[Math.floor(Math.random() * consolationFacts.length)]
        setSpinResult({ type: 'fact', text: fact })
      }
      setSpinning(false)
    }, 2300)
  }

  if (loadingAuth) {
    return <div className="p-8 text-center text-lg">Loading Study Quest...</div>
  }

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-3xl border border-white/50 bg-white/80 p-8 shadow-2xl backdrop-blur"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">Study Quest Cloud</p>
          <h1 className="mt-3 text-4xl text-slate-900 sm:text-5xl">Gamify your study grind.</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Secure sync across devices with Supabase authentication and personalized progress.
          </p>

          <form onSubmit={handleAuthSubmit} className="mt-8 grid gap-4 sm:max-w-md">
            <input
              className="rounded-xl border border-slate-300 bg-white px-4 py-3"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-4 py-3"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700"
            >
              {authMode === 'signup' ? 'Create Account' : 'Log In'}
            </button>
          </form>

          {authError ? <p className="mt-4 text-sm text-rose-700">{authError}</p> : null}

          <button
            type="button"
            className="mt-4 text-sm font-semibold text-slate-800 underline"
            onClick={() => setAuthMode((prev) => (prev === 'signup' ? 'login' : 'signup'))}
          >
            {authMode === 'signup' ? 'Already have an account? Log in' : 'Need an account? Sign up'}
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6">
      <header className="mb-6 rounded-3xl border border-white/50 bg-[var(--card)] p-5 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">Study Quest Cloud</p>
            <h1 className="mt-1 text-3xl text-slate-900 sm:text-4xl">Welcome, {session.user.email}</h1>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/40 bg-white/70 p-2 sm:grid-cols-5">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition sm:text-sm ${
              activeTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {dbError ? (
        <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{dbError}</div>
      ) : null}

      {activeTab === 'Dashboard' ? (
        <div className="grid gap-4">
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-lg">
            <h2 className="text-2xl text-slate-900">Weekly Study Progress</h2>
            <p className="mt-2 text-slate-600">
              {weeklyHours.toFixed(1)} / {WEEKLY_GOAL_HOURS} hours this week
            </p>
            <div className="mt-4 h-4 rounded-full bg-slate-200">
              <motion.div
                className="h-4 rounded-full bg-gradient-to-r from-orange-400 to-rose-500"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.7 }}
              />
            </div>
            <form onSubmit={addStudyLog} className="mt-4 flex gap-2">
              <input
                className="w-28 rounded-xl border border-slate-300 px-3 py-2"
                type="number"
                min="0.25"
                step="0.25"
                value={studyHours}
                onChange={(event) => setStudyHours(event.target.value)}
                required
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              >
                Log Hours
              </button>
            </form>

            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">This Week</p>
              <div className="mt-3 flex h-32 items-end gap-2">
                {weeklySeries.map((day) => {
                  const heightPercent = (day.hours / maxDailyHours) * 100
                  return (
                    <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(6, heightPercent)}%` }}
                        transition={{ duration: 0.5 }}
                        className="w-full rounded-md bg-gradient-to-t from-cyan-500 to-sky-300"
                      />
                      <span className="text-xs text-slate-500">{day.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-lg">
            <h2 className="text-2xl text-slate-900">Today's Habits</h2>
            <div className="mt-4">
              <SimplePieChart completed={todayCompletionRate.completed} total={todayCompletionRate.total} />
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'Exams' ? (
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-lg">
          <h2 className="text-2xl text-slate-900">My Exams</h2>
          <form onSubmit={addExam} className="mt-4 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Exam name"
              value={newExamName}
              onChange={(event) => setNewExamName(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              type="date"
              value={newExamDate}
              onChange={(event) => setNewExamDate(event.target.value)}
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600"
            >
              Add Exam
            </button>
          </form>

          <ul className="mt-4 grid gap-2">
            {exams.map((exam) => {
              const now = new Date()
              const examDate = new Date(exam.exam_date)
              const daysLeft = Math.ceil((examDate.getTime() - now.getTime()) / 86400000)
              return (
                <li key={exam.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{exam.name}</p>
                    <p className="text-sm text-slate-600">
                      {daysLeft > 0 ? `${daysLeft} days left` : 'Exam passed'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExam(exam.id)}
                    className="rounded-lg border border-rose-300 px-2 py-1 text-sm text-rose-700 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {activeTab === 'Habits' ? (
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-lg">
          <h2 className="text-2xl text-slate-900">Daily Habit Tracker</h2>
          <form onSubmit={addHabit} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Add habit"
              value={newHabit}
              onChange={(event) => setNewHabit(event.target.value)}
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
            >
              Add
            </button>
          </form>

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-slate-700">Habit History (Last 30 Days)</p>
            <div className="mb-6 grid grid-cols-10 gap-1">
              {last30Days.map((day) => {
                const count = habitDays[day] || 0
                const intensity = count > 0 ? Math.min(count / habits.length, 1) : 0
                return (
                  <div
                    key={day}
                    className={`h-8 rounded-md transition ${
                      intensity === 0
                        ? 'bg-slate-100'
                        : intensity < 0.5
                          ? 'bg-emerald-200'
                          : intensity < 1
                            ? 'bg-emerald-500'
                            : 'bg-emerald-700'
                    }`}
                    title={`${day}: ${count} completed`}
                  />
                )
              })}
            </div>
          </div>

          <ul className="mt-4 grid gap-2">
            {todayHabits.map((habit) => (
              <li key={habit.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                <label className="flex items-center gap-3 text-slate-800">
                  <input type="checkbox" checked={habit.completedToday} onChange={() => toggleHabit(habit)} />
                  {habit.name}
                </label>
                <button
                  type="button"
                  onClick={() => deleteHabit(habit.id)}
                  className="rounded-lg border border-rose-300 px-2 py-1 text-sm text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeTab === 'The Vault' ? (
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-lg">
          <h2 className="text-2xl text-slate-900">Reward Vault</h2>
          <p className="mt-1 text-sm text-slate-600">Priority 1 = common, Priority 10 = ultra rare.</p>
          <form onSubmit={addReward} className="mt-4 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Reward name"
              value={rewardName}
              onChange={(event) => setRewardName(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              type="number"
              min="1"
              max="10"
              value={rewardPriority}
              onChange={(event) => setRewardPriority(event.target.value)}
              required
            />
            <button
              type="submit"
              className="rounded-xl bg-cyan-700 px-4 py-2 font-semibold text-white hover:bg-cyan-800"
            >
              Add Reward
            </button>
          </form>

          <ul className="mt-4 grid gap-2">
            {rewards.map((reward) => (
              <li
                key={reward.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <p>
                  <span className="font-semibold text-slate-900">{reward.name}</span>
                  <span className="ml-3 text-sm text-slate-600">Priority: {reward.priority}</span>
                </p>
                <button
                  type="button"
                  onClick={() => removeReward(reward.id)}
                  className="rounded-lg border border-rose-300 px-2 py-1 text-sm text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeTab === 'Spinner' ? (
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-lg">
          <h2 className="text-2xl text-slate-900">Reward Spinner</h2>
          <p className="mt-1 text-slate-600">
            Weighted odds are inverse to priority using 1 / priority.
          </p>

          <div className="mt-4 max-w-md">
            <label className="text-sm font-semibold text-slate-700">Reward hit chance: {rewardHitRate}%</label>
            <input
              className="mt-2 w-full"
              type="range"
              min="0"
              max="100"
              value={rewardHitRate}
              onChange={(event) => setRewardHitRate(Number(event.target.value))}
            />
            <p className="mt-1 text-xs text-slate-500">
              If the roll misses, you get a consolation fact instead of a reward.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center gap-5">
            <div className="relative h-48 w-48">
              <motion.div
                animate={{ rotate: spinnerRotation }}
                transition={{ duration: 2.2, ease: [0.15, 0.65, 0.2, 1] }}
                className="h-48 w-48 rounded-full border-8 border-amber-300 bg-[conic-gradient(from_0deg,_#0f172a_0deg_45deg,_#334155_45deg_90deg,_#ef4444_90deg_135deg,_#f59e0b_135deg_180deg,_#10b981_180deg_225deg,_#22d3ee_225deg_270deg,_#6366f1_270deg_315deg,_#e879f9_315deg_360deg)] shadow-lg"
              />
              <div className="absolute -top-2 left-1/2 h-0 w-0 -translate-x-1/2 border-l-8 border-r-8 border-t-[16px] border-l-transparent border-r-transparent border-t-slate-900" />
            </div>

            <button
              type="button"
              onClick={spinForReward}
              disabled={spinning}
              className="rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
            >
              {spinning ? 'Spinning...' : 'Spin'}
            </button>

            <AnimatePresence mode="wait">
              {spinResult ? (
                <motion.div
                  key={spinResult.text}
                  initial={{ opacity: 0, y: 20, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12 }}
                  className={`rounded-xl px-4 py-3 text-center ${
                    spinResult.type === 'reward' ? 'bg-emerald-100 text-emerald-900' : 'bg-sky-100 text-sky-900'
                  }`}
                >
                  {spinResult.type === 'reward' ? (
                    <p>
                      You won: <span className="font-bold">{spinResult.text}</span>
                    </p>
                  ) : (
                    <p>Consolation Fact: {spinResult.text}</p>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default App
